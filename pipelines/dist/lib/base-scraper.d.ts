import { type Page } from "playwright";
export interface RunStats {
    recordsProcessed: number;
    newCount: number;
    updatedCount: number;
    unchangedCount: number;
    errorCount: number;
}
export interface ScraperConfig {
    /** Unique pipeline name (e.g. "scrape-programs-nl") */
    pipelineName: string;
    pipelineDescription: string;
    /** Cron schedule string (e.g. "0 3 * * 1") */
    pipelineSchedule: string;
    /** Delay in ms between page requests. Default: 2500 */
    requestDelayMs?: number;
    /** Max retry attempts per page fetch. Default: 3 */
    maxRetries?: number;
}
export type DiffResult = "new" | "updated" | "unchanged";
export declare abstract class BaseScraper<TRecord> {
    protected readonly config: Required<ScraperConfig>;
    protected readonly USER_AGENT = "Mozilla/5.0 (compatible; DataForge-Bot/1.0; +https://dataforge.io/bot)";
    constructor(config: ScraperConfig);
    /** Collect all URLs to scrape from the source (listing pages, search results, etc.) */
    protected abstract fetchUrls(page: Page): Promise<string[]>;
    /** Parse the HTML of a single detail page into a raw record. Return null to skip. */
    protected abstract parsePage(html: string, url: string): TRecord | null;
    /** Compare a validated record against the database. Return "new", "updated", or "unchanged". */
    protected abstract diffRecord(record: TRecord): Promise<DiffResult>;
    /** Persist a record to the database (insert or update). */
    protected abstract writeRecord(record: TRecord): Promise<void>;
    /** Produce a stable SHA-256 hex hash of arbitrary data (JSON-serialised). */
    protected contentHash(data: unknown): string;
    /** Perform an HTTP HEAD request and return ETag / Last-Modified headers if present.
     *  Returns null on network errors — callers should treat null as "unknown freshness". */
    protected checkFreshness(url: string): Promise<{
        etag?: string;
        lastModified?: string;
    } | null>;
    /** Delay execution for the configured request delay. */
    protected sleep(ms?: number): Promise<void>;
    /** Navigate to a URL with retry logic. */
    protected fetchWithRetry(page: Page, url: string): Promise<void>;
    /**
     * Perform a raw HTTPS GET request to capture:
     * - SHA-256 hash of the raw response body (before any parsing)
     * - HTTP response headers (Date, Content-Type, Server, ETag)
     * - TLS certificate chain info (issuer, valid_from, valid_to)
     * - Intermediary signals (Via, X-Cache, CF-Cache-Status, etc.)
     *
     * Stores results in scrape_integrity_log. Never throws — failures are logged
     * and silently swallowed so they cannot disrupt the main scrape pipeline.
     */
    protected captureIntegrity(url: string, pipelineRunId?: number): Promise<void>;
    /** Internal: perform the raw HTTPS fetch and extract integrity metadata. */
    private _fetchIntegrityData;
    private ensurePipeline;
    private startRun;
    private finishRun;
    /** Execute the full scrape pipeline. Returns aggregate run statistics. */
    run(): Promise<RunStats>;
}
//# sourceMappingURL=base-scraper.d.ts.map