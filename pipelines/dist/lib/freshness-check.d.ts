export interface FreshnessHeaders {
    etag?: string;
    lastModified?: string;
}
/** Issue a HEAD request and return HTTP cache headers. Returns null on error. */
export declare function probeUrl(url: string): Promise<FreshnessHeaders | null>;
/**
 * Determine whether a URL needs a full re-scrape.
 *
 * Returns `{ needed: true }` in all ambiguous cases (first time, HEAD fails,
 * server provides no cache headers) to guarantee we never silently miss updates.
 *
 * Returns `{ needed: false }` only when both stored and live header values are
 * present and identical, meaning the server is confident nothing changed.
 */
export declare function needsRescrape(url: string): Promise<{
    needed: boolean;
    headers: FreshnessHeaders | null;
}>;
/**
 * Upsert the fingerprint record after a successful scrape.
 *
 * @param url         The source URL that was scraped.
 * @param headers     Cache headers returned by probeUrl() (may be null).
 * @param contentHash SHA-256 of the parsed record (not raw HTML).
 * @param changed     Whether the content diffed as "new" or "updated".
 */
export declare function recordFingerprint(url: string, headers: FreshnessHeaders | null, contentHash: string, changed: boolean): Promise<void>;
//# sourceMappingURL=freshness-check.d.ts.map