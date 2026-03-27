// Freshness-check utility: lightweight HEAD-based pre-scrape gate.
//
// Before loading a full page with Playwright, call needsRescrape() to probe
// whether the server's ETag / Last-Modified headers have changed since the
// last recorded scrape. If they haven't, the full scrape can be skipped.
//
// After a successful scrape call recordFingerprint() to persist the new
// header values and content hash, and to update the change-frequency model.
import { db, sourceFingerprints } from "@dataforge/db";
import { eq } from "drizzle-orm";
const USER_AGENT = "Mozilla/5.0 (compatible; DataForge-Bot/1.0; +https://dataforge.io/bot)";
// ─── HEAD probe ───────────────────────────────────────────────────────────────
/** Issue a HEAD request and return HTTP cache headers. Returns null on error. */
export async function probeUrl(url) {
    try {
        const res = await fetch(url, {
            method: "HEAD",
            headers: { "User-Agent": USER_AGENT },
            signal: AbortSignal.timeout(10_000),
        });
        return {
            etag: res.headers.get("etag") ?? undefined,
            lastModified: res.headers.get("last-modified") ?? undefined,
        };
    }
    catch {
        return null;
    }
}
// ─── Gate: does this URL need a full rescrape? ─────────────────────────────────
/**
 * Determine whether a URL needs a full re-scrape.
 *
 * Returns `{ needed: true }` in all ambiguous cases (first time, HEAD fails,
 * server provides no cache headers) to guarantee we never silently miss updates.
 *
 * Returns `{ needed: false }` only when both stored and live header values are
 * present and identical, meaning the server is confident nothing changed.
 */
export async function needsRescrape(url) {
    const headers = await probeUrl(url);
    // No cache headers from server → always scrape (safe default)
    if (!headers || (!headers.etag && !headers.lastModified)) {
        return { needed: true, headers };
    }
    const stored = await db
        .select({
        etag: sourceFingerprints.etag,
        lastModified: sourceFingerprints.lastModified,
    })
        .from(sourceFingerprints)
        .where(eq(sourceFingerprints.url, url))
        .limit(1);
    // First time we've seen this URL → always scrape
    if (stored.length === 0) {
        return { needed: true, headers };
    }
    const fp = stored[0];
    // ETag match → server confirms content unchanged
    if (headers.etag && fp.etag && headers.etag === fp.etag) {
        await _incrementCheckCount(url, false);
        return { needed: false, headers };
    }
    // Last-Modified match (fallback when no ETag)
    if (headers.lastModified && fp.lastModified && headers.lastModified === fp.lastModified) {
        await _incrementCheckCount(url, false);
        return { needed: false, headers };
    }
    return { needed: true, headers };
}
// ─── Post-scrape: persist fingerprint ─────────────────────────────────────────
/**
 * Upsert the fingerprint record after a successful scrape.
 *
 * @param url         The source URL that was scraped.
 * @param headers     Cache headers returned by probeUrl() (may be null).
 * @param contentHash SHA-256 of the parsed record (not raw HTML).
 * @param changed     Whether the content diffed as "new" or "updated".
 */
export async function recordFingerprint(url, headers, contentHash, changed) {
    const now = new Date();
    const stored = await db
        .select()
        .from(sourceFingerprints)
        .where(eq(sourceFingerprints.url, url))
        .limit(1);
    if (stored.length === 0) {
        await db.insert(sourceFingerprints).values({
            url,
            etag: headers?.etag,
            lastModified: headers?.lastModified,
            contentHash,
            lastCheckedAt: now,
            lastChangedAt: now,
            checkCount: 1,
            changeCount: 1, // first scrape always counts as a change
        });
        return;
    }
    const fp = stored[0];
    const newCheckCount = fp.checkCount + 1;
    const newChangeCount = fp.changeCount + (changed ? 1 : 0);
    // Rolling exponential moving average for hours between changes (α = 0.3)
    let avgChangeIntervalHours = fp.avgChangeIntervalHours;
    if (changed && fp.lastChangedAt) {
        const hoursSinceLast = (now.getTime() - fp.lastChangedAt.getTime()) / 3_600_000;
        avgChangeIntervalHours =
            avgChangeIntervalHours == null
                ? hoursSinceLast
                : 0.3 * hoursSinceLast + 0.7 * avgChangeIntervalHours;
    }
    await db
        .update(sourceFingerprints)
        .set({
        etag: headers?.etag ?? fp.etag,
        lastModified: headers?.lastModified ?? fp.lastModified,
        contentHash,
        lastCheckedAt: now,
        lastChangedAt: changed ? now : fp.lastChangedAt,
        checkCount: newCheckCount,
        changeCount: newChangeCount,
        avgChangeIntervalHours,
        updatedAt: now,
    })
        .where(eq(sourceFingerprints.url, url));
}
// ─── Internal helpers ─────────────────────────────────────────────────────────
/** Bump check_count without marking the URL as changed (cache-hit path). */
async function _incrementCheckCount(url, changed) {
    const stored = await db
        .select({
        checkCount: sourceFingerprints.checkCount,
        changeCount: sourceFingerprints.changeCount,
        lastChangedAt: sourceFingerprints.lastChangedAt,
        avgChangeIntervalHours: sourceFingerprints.avgChangeIntervalHours,
    })
        .from(sourceFingerprints)
        .where(eq(sourceFingerprints.url, url))
        .limit(1);
    if (stored.length === 0)
        return;
    const fp = stored[0];
    const now = new Date();
    await db
        .update(sourceFingerprints)
        .set({
        checkCount: fp.checkCount + 1,
        changeCount: fp.changeCount + (changed ? 1 : 0),
        lastCheckedAt: now,
        updatedAt: now,
    })
        .where(eq(sourceFingerprints.url, url));
}
//# sourceMappingURL=freshness-check.js.map