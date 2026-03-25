import { createMiddleware } from "hono/factory";
import type { ApiKeyTier } from "./auth.js";

const LIMITS: Record<ApiKeyTier, number | null> = {
  free: 100,
  pro: 10000,
  enterprise: null, // unlimited
};

interface RateLimitEntry {
  count: number;
  resetAt: number; // unix ms
}

const store = new Map<string, RateLimitEntry>();

function getDayResetTs(): number {
  const now = new Date();
  const reset = new Date(now);
  reset.setUTCHours(24, 0, 0, 0);
  return reset.getTime();
}

export const rateLimitMiddleware = createMiddleware(async (c, next) => {
  const tier = c.get("apiKeyTier") as ApiKeyTier | undefined;
  const limit = tier ? LIMITS[tier] : LIMITS.free;

  if (limit === null) {
    // enterprise: unlimited
    await next();
    return;
  }

  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const keyId = c.get("apiKeyId") ?? "anon";
  const bucketKey = `${ip}:${keyId}`;

  const now = Date.now();
  let entry = store.get(bucketKey);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: getDayResetTs() };
  }

  entry.count += 1;
  store.set(bucketKey, entry);

  const remaining = Math.max(0, limit - entry.count);
  const resetSec = Math.ceil((entry.resetAt - now) / 1000);

  c.header("X-RateLimit-Limit", String(limit));
  c.header("X-RateLimit-Remaining", String(remaining));
  c.header("X-RateLimit-Reset", String(resetSec));

  if (entry.count > limit) {
    return c.json({ data: null, meta: null, error: "Rate limit exceeded" }, 429);
  }

  await next();
});
