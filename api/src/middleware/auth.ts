import { createMiddleware } from "hono/factory";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db, apiKeys } from "@dataforge/db";

export type ApiKeyTier = "free" | "pro" | "enterprise";

declare module "hono" {
  interface ContextVariableMap {
    apiKeyTier: ApiKeyTier;
    apiKeyId: number;
  }
}

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const key = c.req.header("X-API-Key");

  if (!key) {
    return c.json({ data: null, meta: null, error: "Missing API key" }, 401);
  }

  const keyHash = hashKey(key);
  const [record] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!record || !record.isActive) {
    return c.json({ data: null, meta: null, error: "Invalid API key" }, 403);
  }

  if (record.expiresAt && record.expiresAt < new Date()) {
    return c.json({ data: null, meta: null, error: "API key expired" }, 403);
  }

  c.set("apiKeyTier", record.tier as ApiKeyTier);
  c.set("apiKeyId", record.id);

  // Update last used timestamp and request count asynchronously
  db.update(apiKeys)
    .set({ lastUsedAt: new Date(), requestCount: (record.requestCount ?? 0) + 1 })
    .where(eq(apiKeys.id, record.id))
    .execute()
    .catch(() => {});

  await next();
});
