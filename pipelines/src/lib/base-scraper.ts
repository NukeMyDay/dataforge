// Abstract base class for all DataForge silo scrapers.
// Handles shared infrastructure: pipeline tracking, browser lifecycle,
// content-hash diffing, freshness checks, run statistics, and fetch integrity logging.
import { createHash } from "node:crypto";
import http from "node:http";
import https from "node:https";
import type { TLSSocket } from "node:tls";
import { chromium, type Browser, type Page } from "playwright";
import { db, pipelines, pipelineRuns, scrapeIntegrityLog } from "@dataforge/db";
import { eq } from "drizzle-orm";

// ─── Intermediary detection ────────────────────────────────────────────────────

// HTTP headers that indicate CDN or proxy intermediaries between Sophex and the origin.
const INTERMEDIARY_HEADERS = [
  "via",
  "x-cache",
  "x-cache-status",
  "cf-cache-status",     // Cloudflare
  "x-amz-cf-id",        // AWS CloudFront
  "x-varnish",          // Varnish cache
  "x-forwarded-for",
  "x-proxy-cache",
  "age",                 // non-zero Age indicates cached response
] as const;

// Headers to capture verbatim for the integrity log.
const CAPTURED_HEADERS = [
  "date",
  "content-type",
  "server",
  "etag",
  "last-modified",
  "x-powered-by",
] as const;

// ─── Public types ─────────────────────────────────────────────────────────────

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

// ─── Base class ───────────────────────────────────────────────────────────────

export abstract class BaseScraper<TRecord> {
  protected readonly config: Required<ScraperConfig>;
  protected readonly USER_AGENT =
    "Mozilla/5.0 (compatible; DataForge-Bot/1.0; +https://dataforge.io/bot)";

  constructor(config: ScraperConfig) {
    this.config = {
      requestDelayMs: 2500,
      maxRetries: 3,
      ...config,
    };
  }

  // ─── Abstract methods (implemented by each silo scraper) ────────────────────

  /** Collect all URLs to scrape from the source (listing pages, search results, etc.) */
  protected abstract fetchUrls(page: Page): Promise<string[]>;

  /** Parse the HTML of a single detail page into a raw record. Return null to skip. */
  protected abstract parsePage(html: string, url: string): TRecord | null;

  /** Compare a validated record against the database. Return "new", "updated", or "unchanged". */
  protected abstract diffRecord(record: TRecord): Promise<DiffResult>;

  /** Persist a record to the database (insert or update). */
  protected abstract writeRecord(record: TRecord): Promise<void>;

  // ─── Concrete utilities (usable by subclasses) ───────────────────────────────

  /** Produce a stable SHA-256 hex hash of arbitrary data (JSON-serialised). */
  protected contentHash(data: unknown): string {
    return createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
  }

  /** Perform an HTTP HEAD request and return ETag / Last-Modified headers if present.
   *  Returns null on network errors — callers should treat null as "unknown freshness". */
  protected async checkFreshness(
    url: string
  ): Promise<{ etag?: string; lastModified?: string } | null> {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": this.USER_AGENT },
        signal: AbortSignal.timeout(10_000),
      });
      const etag = res.headers.get("etag") ?? undefined;
      const lastModified = res.headers.get("last-modified") ?? undefined;
      return { etag, lastModified };
    } catch {
      return null;
    }
  }

  /** Delay execution for the configured request delay. */
  protected sleep(ms?: number): Promise<void> {
    return new Promise((resolve) =>
      setTimeout(resolve, ms ?? this.config.requestDelayMs)
    );
  }

  /** Navigate to a URL with retry logic. */
  protected async fetchWithRetry(page: Page, url: string): Promise<void> {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
        return;
      } catch (err) {
        if (attempt === this.config.maxRetries) throw err;
        console.warn(
          `[${this.config.pipelineName}][fetcher] Attempt ${attempt} failed for ${url}: ${err}. Retrying...`
        );
        await this.sleep(this.config.requestDelayMs * attempt);
      }
    }
  }

  // ─── Fetch integrity capture ──────────────────────────────────────────────────

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
  protected async captureIntegrity(url: string, pipelineRunId?: number): Promise<void> {
    try {
      const result = await this._fetchIntegrityData(url);
      await db.insert(scrapeIntegrityLog).values({
        sourceUrl: url,
        scrapedAt: new Date(),
        responseHash: result.responseHash ?? undefined,
        httpStatus: result.httpStatus ?? undefined,
        httpHeaders: result.httpHeaders as Record<string, string> | undefined,
        tlsIssuer: result.tlsIssuer ?? undefined,
        tlsValidFrom: result.tlsValidFrom ?? undefined,
        tlsValidTo: result.tlsValidTo ?? undefined,
        intermediaryFlags: result.intermediaryFlags as Record<string, string> | undefined,
        hasIntermediary: result.hasIntermediary,
        pipelineRunId: pipelineRunId ?? undefined,
      });
    } catch (err) {
      console.warn(
        `[${this.config.pipelineName}][integrity] Failed to capture integrity for ${url}: ${err}`
      );
    }
  }

  /** Internal: perform the raw HTTPS fetch and extract integrity metadata. */
  private _fetchIntegrityData(url: string): Promise<{
    responseHash: string | null;
    httpStatus: number | null;
    httpHeaders: Record<string, string> | null;
    tlsIssuer: string | null;
    tlsValidFrom: string | null;
    tlsValidTo: string | null;
    intermediaryFlags: Record<string, string> | null;
    hasIntermediary: boolean;
  }> {
    return new Promise((resolve) => {
      const parsed = new URL(url);

      // Only HTTPS sources can provide TLS proof. HTTP sources still get body hash.
      const isHttps = parsed.protocol === "https:";

      const options = {
        hostname: parsed.hostname,
        port: isHttps ? 443 : 80,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          "User-Agent": this.USER_AGENT,
          Accept: "text/html,application/xhtml+xml,*/*",
        },
        // Capture cert even if self-signed (we document, not reject)
        rejectUnauthorized: false,
        timeout: 15_000,
      };

      const handler = (res: import("node:http").IncomingMessage) => {
        // TLS cert info (only for HTTPS)
        let tlsIssuer: string | null = null;
        let tlsValidFrom: string | null = null;
        let tlsValidTo: string | null = null;

        if (isHttps) {
          try {
            const socket = res.socket as TLSSocket;
            const cert = socket.getPeerCertificate();
            if (cert && Object.keys(cert).length > 0) {
              tlsIssuer = cert.issuer?.O ?? cert.issuer?.CN ?? null;
              tlsValidFrom = cert.valid_from ?? null;
              tlsValidTo = cert.valid_to ?? null;
            }
          } catch {
            // TLS details unavailable — not a failure
          }
        }

        // Capture select response headers
        const httpHeaders: Record<string, string> = {};
        for (const key of CAPTURED_HEADERS) {
          const val = res.headers[key];
          if (val) httpHeaders[key] = Array.isArray(val) ? val[0]! : val;
        }

        // Detect intermediary signals
        const intermediaryFlags: Record<string, string> = {};
        for (const key of INTERMEDIARY_HEADERS) {
          const val = res.headers[key];
          if (val) {
            intermediaryFlags[key] = Array.isArray(val) ? val[0]! : val;
          }
        }
        // Age header > 0 is a strong CDN cache signal
        const age = Number(res.headers["age"]);
        if (!isNaN(age) && age > 0) {
          intermediaryFlags["age"] = String(age);
        }
        const hasIntermediary = Object.keys(intermediaryFlags).length > 0;

        // Stream body and compute SHA-256 hash
        const hasher = createHash("sha256");
        res.on("data", (chunk: Buffer) => hasher.update(chunk));
        res.on("end", () => {
          resolve({
            responseHash: hasher.digest("hex"),
            httpStatus: res.statusCode ?? null,
            httpHeaders: Object.keys(httpHeaders).length > 0 ? httpHeaders : null,
            tlsIssuer,
            tlsValidFrom,
            tlsValidTo,
            intermediaryFlags: Object.keys(intermediaryFlags).length > 0 ? intermediaryFlags : null,
            hasIntermediary,
          });
        });
        res.on("error", () => {
          resolve({
            responseHash: hasher.digest("hex"),
            httpStatus: res.statusCode ?? null,
            httpHeaders: Object.keys(httpHeaders).length > 0 ? httpHeaders : null,
            tlsIssuer,
            tlsValidFrom,
            tlsValidTo,
            intermediaryFlags: null,
            hasIntermediary: false,
          });
        });
      };

      const req = isHttps
        ? https.request(options, handler)
        : http.request(options, handler);

      req.setTimeout(15_000, () => {
        req.destroy();
        resolve({
          responseHash: null,
          httpStatus: null,
          httpHeaders: null,
          tlsIssuer: null,
          tlsValidFrom: null,
          tlsValidTo: null,
          intermediaryFlags: null,
          hasIntermediary: false,
        });
      });

      req.on("error", () => {
        resolve({
          responseHash: null,
          httpStatus: null,
          httpHeaders: null,
          tlsIssuer: null,
          tlsValidFrom: null,
          tlsValidTo: null,
          intermediaryFlags: null,
          hasIntermediary: false,
        });
      });

      req.end();
    });
  }

  // ─── Pipeline tracking helpers ────────────────────────────────────────────────

  private async ensurePipeline(): Promise<number> {
    const existing = await db
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(eq(pipelines.name, this.config.pipelineName))
      .limit(1);

    if (existing.length > 0) return existing[0]!.id;

    const inserted = await db
      .insert(pipelines)
      .values({
        name: this.config.pipelineName,
        description: this.config.pipelineDescription,
        schedule: this.config.pipelineSchedule,
        enabled: true,
      })
      .returning({ id: pipelines.id });

    return inserted[0]!.id;
  }

  private async startRun(pipelineId: number): Promise<number> {
    const [row] = await db
      .insert(pipelineRuns)
      .values({ pipelineId, status: "running", startedAt: new Date() })
      .returning({ id: pipelineRuns.id });
    return row!.id;
  }

  private async finishRun(
    runId: number,
    stats: RunStats,
    errorMessage: string | null
  ): Promise<void> {
    await db
      .update(pipelineRuns)
      .set({
        status: errorMessage ? "failed" : "succeeded",
        finishedAt: new Date(),
        recordsProcessed: stats.recordsProcessed,
        errorMessage,
      })
      .where(eq(pipelineRuns.id, runId));
  }

  // ─── Main run orchestrator ────────────────────────────────────────────────────

  /** Execute the full scrape pipeline. Returns aggregate run statistics. */
  async run(): Promise<RunStats> {
    const name = this.config.pipelineName;
    console.log(`[${name}] Pipeline starting`);

    const pipelineId = await this.ensurePipeline();
    const runId = await this.startRun(pipelineId);

    const stats: RunStats = {
      recordsProcessed: 0,
      newCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      errorCount: 0,
    };
    let fatalError: string | null = null;
    let browser: Browser | null = null;

    try {
      browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ userAgent: this.USER_AGENT });
      const page = await context.newPage();

      // Step 1: collect URLs
      const urls = await this.fetchUrls(page);
      console.log(`[${name}] Collected ${urls.length} URLs`);

      for (const url of urls) {
        try {
          await this.sleep();
          await this.fetchWithRetry(page, url);
          const html = await page.content();

          // Capture fetch integrity in parallel — does not block scrape progress
          void this.captureIntegrity(url, runId);

          // Step 2: parse
          const record = this.parsePage(html, url);
          if (!record) continue;

          // Step 3: diff
          const diffResult = await this.diffRecord(record);
          if (diffResult === "unchanged") {
            stats.unchangedCount++;
            continue;
          }

          // Step 4: write
          await this.writeRecord(record);

          stats.recordsProcessed++;
          if (diffResult === "new") stats.newCount++;
          else stats.updatedCount++;
        } catch (err) {
          // Partial success: log and continue with remaining records
          stats.errorCount++;
          console.error(`[${name}] Failed to process ${url}:`, err);
        }
      }

      console.log(
        `[${name}] Completed — new: ${stats.newCount}, updated: ${stats.updatedCount}, ` +
          `unchanged: ${stats.unchangedCount}, errors: ${stats.errorCount}`
      );
    } catch (err) {
      fatalError = err instanceof Error ? err.message : String(err);
      console.error(`[${name}] Fatal error:`, err);
      throw err;
    } finally {
      await browser?.close();
      await this.finishRun(runId, stats, fatalError);
    }

    return stats;
  }
}
