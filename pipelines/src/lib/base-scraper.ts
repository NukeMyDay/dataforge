// Abstract base class for all DataForge silo scrapers.
// Handles shared infrastructure: pipeline tracking, browser lifecycle,
// content-hash diffing, freshness checks, and run statistics.
import { createHash } from "node:crypto";
import { chromium, type Browser, type Page } from "playwright";
import { db, pipelines, pipelineRuns } from "@dataforge/db";
import { eq } from "drizzle-orm";

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
