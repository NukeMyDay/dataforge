import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { createHmac, randomBytes } from "node:crypto";
import { db, webhooks, webhookDeliveries } from "../db.js";
import { requireJwt } from "../middleware/jwt.js";

export const webhooksRouter = new Hono();

const VALID_EVENTS = [
  "program.created",
  "program.updated",
  "institution.created",
  "institution.updated",
  "regulation.created",
  "regulation.updated",
  "pipeline.completed",
] as const;

// All webhook management routes require JWT
webhooksRouter.use("*", requireJwt);

// GET /v1/webhooks — list caller's webhooks
webhooksRouter.get("/", async (c) => {
  const userId = c.get("userId") as number;
  const rows = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.userId, userId))
    .orderBy(desc(webhooks.createdAt));

  return c.json({
    data: rows.map((w) => ({ ...w, secret: undefined })),
    meta: { total: rows.length },
    error: null,
  });
});

// POST /v1/webhooks — register a new webhook
webhooksRouter.post("/", async (c) => {
  const userId = c.get("userId") as number;
  const body = await c.req.json<{ url: string; events?: string[]; description?: string }>();

  if (!body.url || !body.url.startsWith("http")) {
    return c.json({ data: null, meta: null, error: "url must be a valid http(s) URL" }, 400);
  }

  const events = body.events ?? VALID_EVENTS.slice();
  const invalid = events.filter((e) => !(VALID_EVENTS as readonly string[]).includes(e));
  if (invalid.length > 0) {
    return c.json({ data: null, meta: null, error: `Invalid events: ${invalid.join(", ")}` }, 400);
  }

  const secret = `whsec_${randomBytes(24).toString("hex")}`;
  const [created] = await db
    .insert(webhooks)
    .values({ userId, url: body.url, events, secret, description: body.description ?? null })
    .returning();

  // Return secret once on creation
  return c.json({ data: created, meta: null, error: null }, 201);
});

// GET /v1/webhooks/:id — get webhook details (no secret)
webhooksRouter.get("/:id", async (c) => {
  const userId = c.get("userId") as number;
  const id = parseInt(c.req.param("id"), 10);

  const [webhook] = await db.select().from(webhooks).where(eq(webhooks.id, id));
  if (!webhook || webhook.userId !== userId) {
    return c.json({ data: null, meta: null, error: "Not found" }, 404);
  }

  const deliveries = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhookId, id))
    .orderBy(desc(webhookDeliveries.attemptedAt))
    .limit(20);

  return c.json({
    data: { ...webhook, secret: undefined, recentDeliveries: deliveries },
    meta: null,
    error: null,
  });
});

// PATCH /v1/webhooks/:id — update url/events/active/description
webhooksRouter.patch("/:id", async (c) => {
  const userId = c.get("userId") as number;
  const id = parseInt(c.req.param("id"), 10);
  const body = await c.req.json<{ url?: string; events?: string[]; isActive?: boolean; description?: string }>();

  const [webhook] = await db.select().from(webhooks).where(eq(webhooks.id, id));
  if (!webhook || webhook.userId !== userId) {
    return c.json({ data: null, meta: null, error: "Not found" }, 404);
  }

  if (body.events) {
    const invalid = body.events.filter((e) => !(VALID_EVENTS as readonly string[]).includes(e));
    if (invalid.length > 0) {
      return c.json({ data: null, meta: null, error: `Invalid events: ${invalid.join(", ")}` }, 400);
    }
  }

  const [updated] = await db
    .update(webhooks)
    .set({
      ...(body.url !== undefined ? { url: body.url } : {}),
      ...(body.events !== undefined ? { events: body.events } : {}),
      ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      updatedAt: new Date(),
    })
    .where(eq(webhooks.id, id))
    .returning();

  return c.json({ data: { ...updated, secret: undefined }, meta: null, error: null });
});

// DELETE /v1/webhooks/:id — delete webhook
webhooksRouter.delete("/:id", async (c) => {
  const userId = c.get("userId") as number;
  const id = parseInt(c.req.param("id"), 10);

  const [webhook] = await db.select().from(webhooks).where(eq(webhooks.id, id));
  if (!webhook || webhook.userId !== userId) {
    return c.json({ data: null, meta: null, error: "Not found" }, 404);
  }

  await db.delete(webhooks).where(eq(webhooks.id, id));
  return c.json({ data: { deleted: true }, meta: null, error: null });
});

// --- Delivery helper (called by pipelines) ---

export async function deliverWebhookEvent(
  eventType: (typeof VALID_EVENTS)[number],
  payload: Record<string, unknown>,
): Promise<void> {
  // Find all active webhooks subscribed to this event
  const subscribers = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.isActive, true));

  const applicable = subscribers.filter((w) => w.events.includes(eventType));
  if (applicable.length === 0) return;

  const body = JSON.stringify({
    event: eventType,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  await Promise.allSettled(
    applicable.map(async (webhook) => {
      const ts = Date.now();
      const sig = createHmac("sha256", webhook.secret).update(body).digest("hex");

      let statusCode: number | null = null;
      let responseBody: string | null = null;
      let success = false;

      try {
        const res = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-DataForge-Event": eventType,
            "X-DataForge-Signature": `sha256=${sig}`,
          },
          body,
          signal: AbortSignal.timeout(10_000),
        });
        statusCode = res.status;
        responseBody = await res.text().catch(() => null);
        success = res.ok;
      } catch {
        // network error or timeout — success stays false
      }

      const durationMs = Date.now() - ts;

      await db.insert(webhookDeliveries).values({
        webhookId: webhook.id,
        eventType,
        payload,
        statusCode,
        responseBody,
        durationMs,
        success,
      });

      // Disable webhook after 10 consecutive failures
      const newFailureCount = success ? 0 : (webhook.failureCount ?? 0) + 1;
      await db
        .update(webhooks)
        .set({
          failureCount: newFailureCount,
          isActive: newFailureCount < 10,
          lastTriggeredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(webhooks.id, webhook.id));
    }),
  );
}
