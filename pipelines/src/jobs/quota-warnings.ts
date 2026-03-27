// Quota warning job — runs daily, notifies users approaching limits or with expiring keys

import { db, apiKeys, users } from "@dataforge/db";
import { eq, and, isNotNull, lt, gt } from "drizzle-orm";
import { sendApiKeyQuotaWarningEmail, sendApiKeyExpiryWarningEmail } from "../email.js";

const FREE_TIER_DAILY_LIMIT = 100;
const QUOTA_WARN_THRESHOLD = 0.8; // 80%
const KEY_EXPIRY_WARN_DAYS = 14;

export async function runQuotaWarnings(): Promise<void> {
  console.log("[quota-warnings] Starting quota warning check");
  const now = new Date();

  // Warn free-tier users who have used ≥80% of their daily quota
  const nearLimitKeys = await db
    .select({ id: apiKeys.id, userId: apiKeys.userId, requestCount: apiKeys.requestCount })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.tier, "free"),
        eq(apiKeys.isActive, true),
        isNotNull(apiKeys.userId),
        gt(apiKeys.requestCount, Math.floor(FREE_TIER_DAILY_LIMIT * QUOTA_WARN_THRESHOLD)),
        lt(apiKeys.requestCount, FREE_TIER_DAILY_LIMIT),
      )
    )
    .limit(200);

  for (const key of nearLimitKeys) {
    if (!key.userId) continue;
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, key.userId)).limit(1);
    if (!user) continue;
    const usedPercent = Math.round((key.requestCount / FREE_TIER_DAILY_LIMIT) * 100);
    await sendApiKeyQuotaWarningEmail(user.email, usedPercent).catch((e) =>
      console.error(`[quota-warnings] quota email failed for ${user.email}:`, e)
    );
  }

  // Warn about API keys expiring within 14 days
  const soonExpiring = await db
    .select({ id: apiKeys.id, name: apiKeys.name, userId: apiKeys.userId, expiresAt: apiKeys.expiresAt })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.isActive, true),
        isNotNull(apiKeys.expiresAt),
        isNotNull(apiKeys.userId),
        gt(apiKeys.expiresAt, now),
        lt(apiKeys.expiresAt, new Date(now.getTime() + KEY_EXPIRY_WARN_DAYS * 24 * 60 * 60 * 1000)),
      )
    )
    .limit(200);

  for (const key of soonExpiring) {
    if (!key.userId || !key.expiresAt) continue;
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, key.userId)).limit(1);
    if (!user) continue;
    const daysLeft = Math.ceil((key.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
    await sendApiKeyExpiryWarningEmail(user.email, key.name ?? `Key #${key.id}`, daysLeft).catch((e) =>
      console.error(`[quota-warnings] expiry email failed for ${user.email}:`, e)
    );
  }

  console.log(`[quota-warnings] Done — quota: ${nearLimitKeys.length}, expiry: ${soonExpiring.length}`);
}
