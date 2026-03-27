import { Hono } from "hono";
import { eq, desc, count, ilike, sql } from "drizzle-orm";
import { db, pipelines, pipelineRuns, apiKeys, users, settings } from "../db.js";
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
    const enriched = await Promise.all(rows.map(async (pipeline) => {
        const [latestRun] = await db
            .select()
            .from(pipelineRuns)
            .where(eq(pipelineRuns.pipelineId, pipeline.id))
            .orderBy(desc(pipelineRuns.createdAt))
            .limit(1);
        return { ...pipeline, latestRun: latestRun ?? null };
    }));
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
        count: sql `count(*)::int`,
    })
        .from(pipelineRuns)
        .groupBy(pipelineRuns.status);
    const summary = statusCounts.reduce((acc, r) => {
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
    const enriched = await Promise.all(rows.map(async (user) => {
        const result = await db
            .select({ value: count() })
            .from(apiKeys)
            .where(eq(apiKeys.userId, user.id));
        return { ...user, apiKeyCount: Number(result[0]?.value ?? 0) };
    }));
    return c.json({ data: enriched, meta: { total: enriched.length }, error: null });
});
// PATCH /v1/admin/users/:id — update tier and/or isActive
adminRouter.patch("/users/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
        return c.json({ data: null, meta: null, error: "Invalid user id" }, 400);
    }
    const body = await c.req.json();
    const VALID_TIERS = ["free", "pro", "enterprise"];
    const patch = {};
    if (body.tier !== undefined) {
        if (!VALID_TIERS.includes(body.tier)) {
            return c.json({ data: null, meta: null, error: "Invalid tier" }, 400);
        }
        patch.tier = body.tier;
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
// Keys whose values are masked in GET responses
const MASKED_KEYS = new Set([
    "anthropic_api_key",
    "smtp_pass",
    "stripe_secret_key",
    "stripe_webhook_secret",
]);
// GET /v1/admin/settings — return all settings, masking secret values
adminRouter.get("/settings", async (c) => {
    const rows = await db.select().from(settings).orderBy(settings.key);
    const data = rows.map((row) => ({
        key: row.key,
        value: MASKED_KEYS.has(row.key) && row.value !== null ? "•••" : row.value,
    }));
    return c.json({ data, meta: { total: data.length }, error: null });
});
// PATCH /v1/admin/settings — bulk upsert settings
adminRouter.patch("/settings", async (c) => {
    const body = await c.req.json();
    if (!Array.isArray(body) || body.length === 0) {
        return c.json({ data: null, meta: null, error: "Body must be a non-empty array" }, 400);
    }
    for (const item of body) {
        if (typeof item.key !== "string" || item.key.trim() === "") {
            return c.json({ data: null, meta: null, error: "Each item must have a non-empty key" }, 400);
        }
    }
    await db
        .insert(settings)
        .values(body.map((item) => ({ key: item.key, value: item.value ?? null })))
        .onConflictDoUpdate({
        target: settings.key,
        set: { value: sql `excluded.value`, updatedAt: sql `now()` },
    });
    return c.json({ data: { updated: body.length }, meta: null, error: null });
});
// GET /v1/admin/data-quality — field completeness and staleness report
adminRouter.get("/data-quality", async (c) => {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [programStats] = await db.execute(sql `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE title_en IS NULL AND title_de IS NULL AND title_nl IS NULL)::int AS missing_title,
      COUNT(*) FILTER (WHERE description_en IS NULL AND description_de IS NULL)::int AS missing_description,
      COUNT(*) FILTER (WHERE field_of_study IS NULL)::int AS missing_field,
      COUNT(*) FILTER (WHERE tuition_fee_eur IS NULL)::int AS missing_tuition,
      COUNT(*) FILTER (WHERE language IS NULL)::int AS missing_language,
      COUNT(*) FILTER (WHERE source_url IS NULL)::int AS missing_source_url,
      COUNT(*) FILTER (WHERE updated_at < ${thirtyDaysAgo})::int AS stale_30d,
      COUNT(*) FILTER (WHERE updated_at < ${ninetyDaysAgo})::int AS stale_90d,
      COUNT(*) FILTER (WHERE is_active = false)::int AS inactive
    FROM programs
  `);
    const [institutionStats] = await db.execute(sql `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE name_en IS NULL AND name_de IS NULL AND name_nl IS NULL)::int AS missing_name,
      COUNT(*) FILTER (WHERE description_en IS NULL)::int AS missing_description,
      COUNT(*) FILTER (WHERE city IS NULL)::int AS missing_city,
      COUNT(*) FILTER (WHERE website_url IS NULL)::int AS missing_website,
      COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)::int AS missing_geocoords,
      COUNT(*) FILTER (WHERE updated_at < ${thirtyDaysAgo})::int AS stale_30d
    FROM institutions
  `);
    const [regulationStats] = await db.execute(sql `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE title_en IS NULL)::int AS missing_title_en,
      COUNT(*) FILTER (WHERE body_en IS NULL)::int AS missing_body_en,
      COUNT(*) FILTER (WHERE source_url IS NULL)::int AS missing_source_url,
      COUNT(*) FILTER (WHERE updated_at < ${thirtyDaysAgo})::int AS stale_30d
    FROM regulations
  `);
    function completeness(missing, total) {
        if (total === 0)
            return 100;
        return Math.round(((total - missing) / total) * 100);
    }
    const ps = programStats;
    const is = institutionStats;
    const rs = regulationStats;
    return c.json({
        data: {
            programs: {
                total: ps.total,
                inactive: ps.inactive,
                stale30d: ps.stale_30d,
                stale90d: ps.stale_90d,
                completeness: {
                    title: completeness(ps.missing_title, ps.total),
                    description: completeness(ps.missing_description, ps.total),
                    fieldOfStudy: completeness(ps.missing_field, ps.total),
                    tuitionFee: completeness(ps.missing_tuition, ps.total),
                    language: completeness(ps.missing_language, ps.total),
                    sourceUrl: completeness(ps.missing_source_url, ps.total),
                },
            },
            institutions: {
                total: is.total,
                stale30d: is.stale_30d,
                completeness: {
                    name: completeness(is.missing_name, is.total),
                    description: completeness(is.missing_description, is.total),
                    city: completeness(is.missing_city, is.total),
                    website: completeness(is.missing_website, is.total),
                    geocoords: completeness(is.missing_geocoords, is.total),
                },
            },
            regulations: {
                total: rs.total,
                stale30d: rs.stale_30d,
                completeness: {
                    titleEn: completeness(rs.missing_title_en, rs.total),
                    bodyEn: completeness(rs.missing_body_en, rs.total),
                    sourceUrl: completeness(rs.missing_source_url, rs.total),
                },
            },
        },
        meta: { generatedAt: new Date().toISOString() },
        error: null,
    });
});
//# sourceMappingURL=admin.js.map