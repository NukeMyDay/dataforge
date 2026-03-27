// Lightweight webhook delivery helper for use in pipeline workers.
// Mirrors the logic in api/src/routes/webhooks.ts but runs inside the pipeline process.
import { createHmac } from "node:crypto";
import { db, webhooks, webhookDeliveries } from "@dataforge/db";
import { eq } from "drizzle-orm";
export async function deliverWebhookEvent(eventType, payload) {
    const subscribers = await db.select().from(webhooks).where(eq(webhooks.isActive, true));
    const applicable = subscribers.filter((w) => w.events.includes(eventType));
    if (applicable.length === 0)
        return;
    const body = JSON.stringify({
        event: eventType,
        timestamp: new Date().toISOString(),
        data: payload,
    });
    await Promise.allSettled(applicable.map(async (webhook) => {
        const ts = Date.now();
        const sig = createHmac("sha256", webhook.secret).update(body).digest("hex");
        let statusCode = null;
        let responseBody = null;
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
        }
        catch {
            // network error / timeout
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
    }));
}
//# sourceMappingURL=webhook.js.map