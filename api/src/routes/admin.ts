import { Hono } from "hono";
import { eq, desc, count, ilike, sql } from "drizzle-orm";
import { db, pipelines, pipelineRuns, apiKeys, users } from "../db.js";
import { requireJwt, requireAdmin } from "../middleware/jwt.js";
import { sendJob } from "../boss.js";

export const adminRouter = new Hono();

// All /v1/admin/* routes require a valid JWT with role=admin
adminRouter.use("*", requireJwt, requireAdmin);

// GET /v1/admin/pipelines — list all pipelines with their latest run
adminRouter.get("/pipelines", async (c) => {
  const rows = await db
    .select({
      id: pipelines.id,
      name: pipelines.name,
      description: pipelines.description,
      schedule: pipelines.schedule,
      enabled: pipelines.enabled,
      createdAt: pipelines.createdAt,
      updatedAt: pipelines.updatedAt,
    })
    .from(pipelines)
    .orderBy(pipelines.name);

  // Fetch latest run for each pipeline
  const enriched = await Promise.all(
    rows.map(async (pipeline) => {
      const [latestRun] = await db
        .select()
        .from(pipelineRuns)
        .where(eq(pipelineRuns.pipelineId, pipeline.id))
        .orderBy(desc(pipelineRuns.createdAt))
        .limit(1);
      return { ...pipeline, latestRun: latestRun ?? null };
    }),
  );

  return c.json({ data: enriched, meta: { total: enriched.length }, error: null });
});

// GET /v1/admin/pipelines/:id/runs — paginated run history for a single pipeline
adminRouter.get("/pipelines/:id/runs", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ data: null, meta: null, error: "Invalid pipeline id" }, 400);
  }

  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(50, Math.max(1, Number(c.req.query("pageSize") ?? 20)));
  const offset = (page - 1) * pageSize;

  const [runs, countRows] = await Promise.all([
    db
      .select()
      .from(pipelineRuns)
      .where(eq(pipelineRuns.pipelineId, id))
      .orderBy(desc(pipelineRuns.startedAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: count() }).from(pipelineRuns).where(eq(pipelineRuns.pipelineId, id)),
  ]);

  const total = Number(countRows[0]?.total ?? 0);

  return c.json({
    data: runs,
    meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    error: null,
  });
});

// GET /v1/admin/runs — recent runs across all pipelines (dashboard overview)
adminRouter.get("/runs", async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") ?? 20)));

  const rows = await db
    .select({
      run: pipelineRuns,
      pipelineName: pipelines.name,
    })
    .from(pipelineRuns)
    .innerJoin(pipelines, eq(pipelineRuns.pipelineId, pipelines.id))
    .orderBy(desc(pipelineRuns.startedAt))
    .limit(limit);

  // Count totals by status for summary
  const statusCounts = await db
    .select({
      status: pipelineRuns.status,
      count: sql<number>`count(*)::int`,
    })
    .from(pipelineRuns)
    .groupBy(pipelineRuns.status);

  const summary = statusCounts.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = r.count;
    return acc;
  }, {});

  return c.json({
    data: rows.map((r) => ({ ...r.run, pipelineName: r.pipelineName })),
    meta: { total: rows.length, summary },
    error: null,
  });
});

// POST /v1/admin/pipelines/:id/trigger — enqueue a pg-boss job immediately
adminRouter.post("/pipelines/:id/trigger", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ data: null, meta: null, error: "Invalid pipeline id" }, 400);
  }

  const [pipeline] = await db
    .select({ id: pipelines.id, name: pipelines.name, enabled: pipelines.enabled })
    .from(pipelines)
    .where(eq(pipelines.id, id))
    .limit(1);

  if (!pipeline) {
    return c.json({ data: null, meta: null, error: "Pipeline not found" }, 404);
  }

  const jobId = await sendJob(pipeline.name, {});

  return c.json({ data: { pipelineId: pipeline.id, jobId }, meta: null, error: null }, 202);
});

// GET /v1/admin/api-keys — list all API keys with usage stats
adminRouter.get("/api-keys", async (c) => {
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      ownerId: apiKeys.ownerId,
      userId: apiKeys.userId,
      tier: apiKeys.tier,
      isActive: apiKeys.isActive,
      lastUsedAt: apiKeys.lastUsedAt,
      requestCount: apiKeys.requestCount,
      expiresAt: apiKeys.expiresAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .orderBy(desc(apiKeys.createdAt));

  return c.json({ data: rows, meta: { total: rows.length }, error: null });
});

// DELETE /v1/admin/api-keys/:id — deactivate a key
adminRouter.delete("/api-keys/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ data: null, meta: null, error: "Invalid key id" }, 400);
  }

  const [updated] = await db
    .update(apiKeys)
    .set({ isActive: false })
    .where(eq(apiKeys.id, id))
    .returning({ id: apiKeys.id });

  if (!updated) {
    return c.json({ data: null, meta: null, error: "API key not found" }, 404);
  }

  return c.json({ data: { id: updated.id, revoked: true }, meta: null, error: null });
});

// GET /v1/admin/users — list all users with API key count
adminRouter.get("/users", async (c) => {
  const q = c.req.query("q");

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      tier: users.tier,
      status: users.status,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(q ? ilike(users.email, `%${q}%`) : undefined)
    .orderBy(desc(users.createdAt));

  // Attach API key count per user
  const enriched = await Promise.all(
    rows.map(async (user) => {
      const result = await db
        .select({ value: count() })
        .from(apiKeys)
        .where(eq(apiKeys.userId, user.id));
      return { ...user, apiKeyCount: Number(result[0]?.value ?? 0) };
    }),
  );

  return c.json({ data: enriched, meta: { total: enriched.length }, error: null });
});

// PATCH /v1/admin/users/:id — update tier and/or isActive
adminRouter.patch("/users/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ data: null, meta: null, error: "Invalid user id" }, 400);
  }

  const body = await c.req.json<{ tier?: string; isActive?: boolean }>();
  const VALID_TIERS = ["free", "pro", "enterprise"] as const;
  type Tier = (typeof VALID_TIERS)[number];

  const patch: { tier?: Tier; isActive?: boolean } = {};

  if (body.tier !== undefined) {
    if (!(VALID_TIERS as readonly string[]).includes(body.tier)) {
      return c.json({ data: null, meta: null, error: "Invalid tier" }, 400);
    }
    patch.tier = body.tier as Tier;
  }
  if (body.isActive !== undefined) {
    patch.isActive = Boolean(body.isActive);
  }

  if (Object.keys(patch).length === 0) {
    return c.json({ data: null, meta: null, error: "No valid fields to update" }, 400);
  }

  const [updated] = await db
    .update(users)
    .set(patch)
    .where(eq(users.id, id))
    .returning({ id: users.id, email: users.email, tier: users.tier, isActive: users.isActive });

  if (!updated) {
    return c.json({ data: null, meta: null, error: "User not found" }, 404);
  }

  return c.json({ data: updated, meta: null, error: null });
});
