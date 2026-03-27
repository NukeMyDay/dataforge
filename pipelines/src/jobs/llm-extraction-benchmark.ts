/**
 * LLM Extraction Benchmark — CSS Selectors vs. LLM-based Extraction
 *
 * Compares three extraction strategies on a sample of foerderdatenbank.de pages:
 *   1. CSS-only   — existing heading-based Cheerio selectors
 *   2. LLM-only   — Claude Haiku with no CSS pre-pass
 *   3. Hybrid     — CSS first, LLM fallback for null fields only
 *
 * Metrics per strategy:
 *   - Accuracy   : filled fields out of 7 tracked fields (proxy for completeness)
 *   - Speed      : wall-clock time per page (ms)
 *   - Error rate : % of pages where extraction returned zero fields
 *   - Cost       : LLM token usage + estimated USD (Haiku blended rate)
 *
 * Resilience test (optional):
 *   Simulates h2/h3 → h4/h5 rename (common CMS update) and measures
 *   how much each strategy degrades under structural change.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... tsx src/jobs/llm-extraction-benchmark.ts
 *
 * Optional env vars:
 *   BENCHMARK_SAMPLE_SIZE=20   (default: 20)
 *   BENCHMARK_RESILIENCE=true  (default: true)
 *   BENCHMARK_OUTPUT=./benchmark-report.json  (default: stdout summary only)
 */
import { chromium } from "playwright";
import * as cheerio from "cheerio";
import * as fs from "node:fs/promises";
import { extractFieldsWithLLM, type FieldSchema } from "../lib/llm-extractor.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.foerderdatenbank.de";
const SEARCH_URL = `${BASE_URL}/SiteGlobals/FDB/Forms/Suche/Foederprogrammsuche_Formular.html`;
const SAMPLE_SIZE = parseInt(process.env.BENCHMARK_SAMPLE_SIZE ?? "20", 10);
const RUN_RESILIENCE = process.env.BENCHMARK_RESILIENCE !== "false";
const OUTPUT_PATH = process.env.BENCHMARK_OUTPUT ?? null;
const REQUEST_DELAY_MS = 1500;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// The 7 content fields we compare across strategies
const TRACKED_FIELDS = [
  "summaryDe",
  "descriptionDe",
  "legalRequirementsDe",
  "directiveDe",
  "applicationProcess",
  "deadlineInfo",
  "fundingAmountInfo",
] as const;

type TrackedField = (typeof TRACKED_FIELDS)[number];

// LLM field schemas (mirrors scrape-funding-bund.ts)
const FIELD_SCHEMAS: Record<TrackedField, FieldSchema> = {
  summaryDe: {
    description: "Short summary of the funding program in German",
    hint: "look for 'Kurztext' or 'Kurzzusammenfassung' headings",
  },
  descriptionDe: {
    description: "Full description of the funding program in German",
    hint: "look for 'Volltext' heading",
  },
  legalRequirementsDe: {
    description: "Legal requirements and eligibility criteria in German",
    hint: "look for 'Rechtliche Voraussetzungen' headings",
  },
  directiveDe: {
    description: "Legal basis and directives in German",
    hint: "look for 'Richtlinie' or 'Rechtsgrundlage' headings",
  },
  applicationProcess: {
    description: "Application process in German",
    hint: "look for 'Antrag' or 'Verfahren' headings",
  },
  deadlineInfo: {
    description: "Application deadlines in German",
    hint: "look for 'Frist' or 'Termin' headings",
  },
  fundingAmountInfo: {
    description: "Funding amounts — e.g. 'bis zu X Euro', percentages",
  },
};

// ─── CSS extraction (mirrors scrape-funding-bund.ts logic) ───────────────────

interface ParsedFunding {
  summaryDe: string | null;
  descriptionDe: string | null;
  legalRequirementsDe: string | null;
  directiveDe: string | null;
  applicationProcess: string | null;
  deadlineInfo: string | null;
  fundingAmountInfo: string | null;
}

function parseCssOnly(html: string): ParsedFunding {
  const $ = cheerio.load(html);

  function extractSection(headingTexts: string[]): string | null {
    const result: string[] = [];
    $("h2, h3").each((_, el) => {
      const heading = $(el).text().trim().toLowerCase();
      if (!headingTexts.some((h) => heading.includes(h.toLowerCase()))) return;
      let next = $(el).next();
      while (next.length && !next.is("h2, h3")) {
        const text = next.text().trim();
        if (text) result.push(text);
        next = next.next();
      }
    });
    return result.length > 0 ? result.join("\n\n") : null;
  }

  const summaryDe = extractSection(["kurztext", "kurzzusammenfassung"]);
  const descriptionDe = extractSection(["volltext"]);
  const legalRequirementsDe = extractSection(["rechtliche voraussetzungen", "voraussetzungen"]);
  const directiveDe = extractSection(["richtlinie", "rechtsgrundlage"]);
  const applicationProcess = extractSection(["antrag", "verfahren", "wie beantrage"]);
  const deadlineInfo = extractSection(["frist", "termin", "stichtag"]);

  let fundingAmountInfo: string | null = null;
  const fullText = [summaryDe, descriptionDe].filter(Boolean).join(" ");
  const patterns = [
    /(?:bis zu|maximal|höchstens)\s+(?:EUR\s+)?[\d.,]+\s*(?:Millionen|Mio|Euro|EUR|Prozent|%)/gi,
    /[\d.,]+\s*(?:Prozent|%)\s*(?:der\s+)?(?:förderfähigen|zuwendungsfähigen)/gi,
  ];
  const amounts: string[] = [];
  for (const p of patterns) amounts.push(...(fullText.match(p) ?? []));
  if (amounts.length > 0) fundingAmountInfo = [...new Set(amounts)].join("; ");

  return { summaryDe, descriptionDe, legalRequirementsDe, directiveDe, applicationProcess, deadlineInfo, fundingAmountInfo };
}

/**
 * Simulate a page structure change by renaming h2/h3 → h4/h5.
 * Breaks all heading-based CSS selectors while leaving content intact.
 */
function simulateStructureChange(html: string): string {
  return html
    .replace(/<h2(\s|>)/gi, "<h4$1")
    .replace(/<\/h2>/gi, "</h4>")
    .replace(/<h3(\s|>)/gi, "<h5$1")
    .replace(/<\/h3>/gi, "</h5>");
}

// ─── Metrics helpers ──────────────────────────────────────────────────────────

function countFilled(record: ParsedFunding): number {
  return TRACKED_FIELDS.filter((f) => record[f] !== null).length;
}

function fillMap(record: ParsedFunding): Record<TrackedField, boolean> {
  return Object.fromEntries(
    TRACKED_FIELDS.map((f) => [f, record[f] !== null])
  ) as Record<TrackedField, boolean>;
}

// ─── URL collection ───────────────────────────────────────────────────────────

async function collectSampleUrls(
  page: import("playwright").Page,
  limit: number
): Promise<string[]> {
  const urls = new Set<string>();
  const firstUrl = `${SEARCH_URL}?filterCategories=FundingProgram&submit=Suchen`;
  await page.goto(firstUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));

  let html = await page.content();
  let $ = cheerio.load(html);

  // Extract pagination GUID
  let guid: string | null = null;
  $(".pagination a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(/gtp=%2526([a-f0-9-]+)_list/);
    if (m) guid = m[1]!;
  });

  function extractLinks($doc: typeof $): void {
    $doc("a[href*='FDB/Content/DE/Foerderprogramm']").each((_, el) => {
      let href = $doc(el).attr("href");
      if (!href?.endsWith(".html")) return;
      if (!href.startsWith("http")) href = `${BASE_URL}/${href}`;
      if (!urls.has(href)) urls.add(href);
    });
  }

  extractLinks($);
  let pageNo = 2;
  while (urls.size < limit && guid) {
    const url = `${SEARCH_URL}?gtp=%2526${guid}_list%253D${pageNo}&submit=Suchen&filterCategories=FundingProgram`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    html = await page.content();
    $ = cheerio.load(html);
    const before = urls.size;
    extractLinks($);
    if (urls.size === before) break;
    pageNo++;
  }

  return [...urls].slice(0, limit);
}

// ─── Report types ─────────────────────────────────────────────────────────────

interface StrategyStats {
  fieldsFound: number;
  fields: Record<TrackedField, boolean>;
  speedMs: number;
  tokensUsed: number;
  error: boolean;
}

interface PageResult {
  url: string;
  css: StrategyStats;
  llmOnly: StrategyStats;
  hybrid: StrategyStats;
}

interface FieldBreakdown {
  cssFillRate: number;
  llmOnlyFillRate: number;
  hybridFillRate: number;
}

interface ResilienceDetail {
  url: string;
  css: { original: number; modified: number; recovered: number };
  llmOnly: { original: number; modified: number; recovered: number };
}

interface BenchmarkReport {
  runDate: string;
  sampleSize: number;
  pagesSucceeded: number;

  // Accuracy (avg filled fields out of 7)
  avgCssFields: number;
  avgLlmOnlyFields: number;
  avgHybridFields: number;

  // Speed (avg wall-clock ms per page, excluding page load)
  avgCssSpeedMs: number;
  avgLlmOnlySpeedMs: number;
  avgHybridSpeedMs: number;

  // Error rate (% pages where extraction returned 0 fields)
  cssErrorRate: number;
  llmOnlyErrorRate: number;
  hybridErrorRate: number;

  // Cost (LLM strategies only)
  llmOnlyTotalTokens: number;
  llmOnlyEstimatedCostUsd: number;
  hybridTotalTokens: number;
  hybridEstimatedCostUsd: number;

  // Per-field fill rates across all pages
  fieldBreakdown: Record<TrackedField, FieldBreakdown>;

  // Resilience (optional — simulated CSS class rename)
  resilience?: {
    cssDropPct: number;       // % of fields lost when structure changed
    llmOnlyDropPct: number;
    hybridDropPct: number;
    detail: ResilienceDetail;
  };

  pages: PageResult[];
}

// ─── Main benchmark ───────────────────────────────────────────────────────────

async function runBenchmark(): Promise<void> {
  console.log("[benchmark] === CSS Selectors vs. LLM-based Extraction ===");
  console.log(`[benchmark] Sample size: ${SAMPLE_SIZE} pages`);
  console.log(`[benchmark] Resilience test: ${RUN_RESILIENCE ? "enabled" : "disabled"}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY must be set to run the benchmark");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();

  try {
    // ── Collect URLs ─────────────────────────────────────────────────────────
    console.log(`[benchmark] Collecting ${SAMPLE_SIZE} program URLs...`);
    const urls = await collectSampleUrls(page, SAMPLE_SIZE);
    console.log(`[benchmark] Got ${urls.length} URLs`);

    const pageResults: PageResult[] = [];
    let llmOnlyTotalTokens = 0;
    let hybridTotalTokens = 0;

    // Per-field fill counts
    const cssFills: Record<TrackedField, number> = Object.fromEntries(
      TRACKED_FIELDS.map((f) => [f, 0])
    ) as Record<TrackedField, number>;
    const llmOnlyFills: Record<TrackedField, number> = Object.fromEntries(
      TRACKED_FIELDS.map((f) => [f, 0])
    ) as Record<TrackedField, number>;
    const hybridFills: Record<TrackedField, number> = Object.fromEntries(
      TRACKED_FIELDS.map((f) => [f, 0])
    ) as Record<TrackedField, number>;

    // ── Per-page extraction ──────────────────────────────────────────────────
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]!;
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
        const html = await page.content();

        // Strategy 1: CSS-only
        const t0 = Date.now();
        const cssResult = parseCssOnly(html);
        const cssSpeedMs = Date.now() - t0;
        const cssMap = fillMap(cssResult);
        const cssCount = countFilled(cssResult);

        // Strategy 2: LLM-only (all fields requested, no CSS pre-pass)
        const t1 = Date.now();
        const llmOnlyRaw = await extractFieldsWithLLM({ html, fields: FIELD_SCHEMAS });
        const llmOnlySpeedMs = Date.now() - t1;
        const llmOnlyTokens = llmOnlyRaw.tokensInput + llmOnlyRaw.tokensOutput;
        llmOnlyTotalTokens += llmOnlyTokens;

        const llmOnlyResult: ParsedFunding = Object.fromEntries(
          TRACKED_FIELDS.map((f) => [f, (llmOnlyRaw.fields[f] as string | null) ?? null])
        ) as ParsedFunding;
        const llmOnlyMap = fillMap(llmOnlyResult);
        const llmOnlyCount = countFilled(llmOnlyResult);

        // Strategy 3: Hybrid (CSS first, LLM for nulls only)
        const missingFields = TRACKED_FIELDS.filter((f) => !cssMap[f]);
        let hybridMap = { ...cssMap };
        let hybridTokens = 0;
        let hybridLlmMs = 0;

        if (missingFields.length > 0) {
          const missingSchemas: Record<string, FieldSchema> = {};
          for (const f of missingFields) missingSchemas[f] = FIELD_SCHEMAS[f];
          const t2 = Date.now();
          const fallback = await extractFieldsWithLLM({ html, fields: missingSchemas });
          hybridLlmMs = Date.now() - t2;
          hybridTokens = fallback.tokensInput + fallback.tokensOutput;
          hybridTotalTokens += hybridTokens;
          for (const f of missingFields) {
            if (fallback.fields[f]) hybridMap[f] = true;
          }
        }
        const hybridSpeedMs = cssSpeedMs + hybridLlmMs;
        const hybridCount = TRACKED_FIELDS.filter((f) => hybridMap[f]).length;

        // Accumulate per-field stats
        for (const f of TRACKED_FIELDS) {
          if (cssMap[f]) cssFills[f]++;
          if (llmOnlyMap[f]) llmOnlyFills[f]++;
          if (hybridMap[f]) hybridFills[f]++;
        }

        pageResults.push({
          url,
          css: { fieldsFound: cssCount, fields: cssMap, speedMs: cssSpeedMs, tokensUsed: 0, error: cssCount === 0 },
          llmOnly: { fieldsFound: llmOnlyCount, fields: llmOnlyMap, speedMs: llmOnlySpeedMs, tokensUsed: llmOnlyTokens, error: llmOnlyCount === 0 },
          hybrid: { fieldsFound: hybridCount, fields: hybridMap as Record<TrackedField, boolean>, speedMs: hybridSpeedMs, tokensUsed: hybridTokens, error: hybridCount === 0 },
        });

        if ((i + 1) % 5 === 0 || i === urls.length - 1) {
          const n = pageResults.length;
          console.log(
            `[benchmark] ${i + 1}/${urls.length} — ` +
            `css: ${(pageResults.reduce((s, r) => s + r.css.fieldsFound, 0) / n).toFixed(1)}/7, ` +
            `llm-only: ${(pageResults.reduce((s, r) => s + r.llmOnly.fieldsFound, 0) / n).toFixed(1)}/7, ` +
            `hybrid: ${(pageResults.reduce((s, r) => s + r.hybrid.fieldsFound, 0) / n).toFixed(1)}/7`
          );
        }
      } catch (err) {
        console.warn(`[benchmark] Page ${i + 1} failed: ${url} — ${err}`);
        // Record as zero-field error result so error rate is accurate
        const zeroFields = Object.fromEntries(TRACKED_FIELDS.map((f) => [f, false])) as Record<TrackedField, boolean>;
        pageResults.push({
          url,
          css: { fieldsFound: 0, fields: zeroFields, speedMs: 0, tokensUsed: 0, error: true },
          llmOnly: { fieldsFound: 0, fields: zeroFields, speedMs: 0, tokensUsed: 0, error: true },
          hybrid: { fieldsFound: 0, fields: zeroFields, speedMs: 0, tokensUsed: 0, error: true },
        });
      }
    }

    const n = pageResults.length;

    // ── Resilience test ──────────────────────────────────────────────────────
    let resilienceData: BenchmarkReport["resilience"] | undefined;
    if (RUN_RESILIENCE && n > 0) {
      console.log("[benchmark] Running resilience test (simulated h2/h3 → h4/h5 rename)...");
      const testUrl = pageResults.find((r) => !r.css.error)?.url ?? pageResults[0]!.url;
      await page.goto(testUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      const originalHtml = await page.content();
      const modifiedHtml = simulateStructureChange(originalHtml);

      // Original (baseline)
      const cssOrig = countFilled(parseCssOnly(originalHtml));
      const llmOrigRaw = await extractFieldsWithLLM({ html: originalHtml, fields: FIELD_SCHEMAS });
      const llmOrigResult: ParsedFunding = Object.fromEntries(
        TRACKED_FIELDS.map((f) => [f, (llmOrigRaw.fields[f] as string | null) ?? null])
      ) as ParsedFunding;
      const llmOrig = countFilled(llmOrigResult);

      // After structure change
      const cssMod = countFilled(parseCssOnly(modifiedHtml));
      const llmModRaw = await extractFieldsWithLLM({ html: modifiedHtml, fields: FIELD_SCHEMAS });
      const llmModResult: ParsedFunding = Object.fromEntries(
        TRACKED_FIELDS.map((f) => [f, (llmModRaw.fields[f] as string | null) ?? null])
      ) as ParsedFunding;
      const llmMod = countFilled(llmModResult);

      // Hybrid on modified
      const cssModParsed = parseCssOnly(modifiedHtml);
      const cssModMap = fillMap(cssModParsed);
      const modMissing = TRACKED_FIELDS.filter((f) => !cssModMap[f]);
      let hybridModCount = TRACKED_FIELDS.filter((f) => cssModMap[f]).length;
      if (modMissing.length > 0) {
        const modSchemas: Record<string, FieldSchema> = {};
        for (const f of modMissing) modSchemas[f] = FIELD_SCHEMAS[f];
        const fallback = await extractFieldsWithLLM({ html: modifiedHtml, fields: modSchemas });
        hybridModCount += Object.values(fallback.fields).filter(Boolean).length;
      }
      const hybridOrig = cssOrig; // hybrid on original same as baseline (CSS found all)

      const pct = (a: number, b: number) =>
        b > 0 ? Math.round(((b - a) / b) * 100) : 0;

      resilienceData = {
        cssDropPct: pct(cssMod, cssOrig),
        llmOnlyDropPct: pct(llmMod, llmOrig),
        hybridDropPct: pct(hybridModCount, hybridOrig),
        detail: {
          url: testUrl,
          css: { original: cssOrig, modified: cssMod, recovered: 0 },
          llmOnly: { original: llmOrig, modified: llmMod, recovered: 0 },
        },
      };

      console.log(
        `[benchmark] Resilience — CSS drop: ${resilienceData.cssDropPct}%, ` +
        `LLM-only drop: ${resilienceData.llmOnlyDropPct}%, ` +
        `hybrid drop: ${resilienceData.hybridDropPct}%`
      );
    }

    // ── Aggregate metrics ────────────────────────────────────────────────────
    const avg = (fn: (r: PageResult) => number) =>
      Math.round((pageResults.reduce((s, r) => s + fn(r), 0) / n) * 100) / 100;

    const errorRate = (fn: (r: PageResult) => boolean) =>
      Math.round((pageResults.filter((r) => fn(r)).length / n) * 100);

    // Haiku blended estimate: $1/1M input + $5/1M output ≈ $3/1M blended
    const costUsd = (tokens: number) =>
      Math.round(((tokens / 1_000_000) * 3.0) * 10_000) / 10_000;

    const fieldBreakdown: Record<TrackedField, FieldBreakdown> = Object.fromEntries(
      TRACKED_FIELDS.map((f) => [
        f,
        {
          cssFillRate: Math.round((cssFills[f] / n) * 100),
          llmOnlyFillRate: Math.round((llmOnlyFills[f] / n) * 100),
          hybridFillRate: Math.round((hybridFills[f] / n) * 100),
        },
      ])
    ) as Record<TrackedField, FieldBreakdown>;

    const report: BenchmarkReport = {
      runDate: new Date().toISOString(),
      sampleSize: SAMPLE_SIZE,
      pagesSucceeded: pageResults.filter((r) => !r.css.error).length,

      avgCssFields: avg((r) => r.css.fieldsFound),
      avgLlmOnlyFields: avg((r) => r.llmOnly.fieldsFound),
      avgHybridFields: avg((r) => r.hybrid.fieldsFound),

      avgCssSpeedMs: avg((r) => r.css.speedMs),
      avgLlmOnlySpeedMs: avg((r) => r.llmOnly.speedMs),
      avgHybridSpeedMs: avg((r) => r.hybrid.speedMs),

      cssErrorRate: errorRate((r) => r.css.error),
      llmOnlyErrorRate: errorRate((r) => r.llmOnly.error),
      hybridErrorRate: errorRate((r) => r.hybrid.error),

      llmOnlyTotalTokens,
      llmOnlyEstimatedCostUsd: costUsd(llmOnlyTotalTokens),
      hybridTotalTokens,
      hybridEstimatedCostUsd: costUsd(hybridTotalTokens),

      fieldBreakdown,
      ...(resilienceData ? { resilience: resilienceData } : {}),
      pages: pageResults,
    };

    // ── Print summary ────────────────────────────────────────────────────────
    console.log(`\n[benchmark] ════ RESULTS ════`);
    console.log(`Pages tested:              ${n} (succeeded: ${report.pagesSucceeded})`);
    console.log(`\nAccuracy (avg fields/7):`);
    console.log(`  CSS-only:  ${report.avgCssFields.toFixed(2)}`);
    console.log(`  LLM-only:  ${report.avgLlmOnlyFields.toFixed(2)}`);
    console.log(`  Hybrid:    ${report.avgHybridFields.toFixed(2)}`);
    console.log(`\nSpeed (avg ms/page, excl. page load):`);
    console.log(`  CSS-only:  ${report.avgCssSpeedMs} ms`);
    console.log(`  LLM-only:  ${report.avgLlmOnlySpeedMs} ms`);
    console.log(`  Hybrid:    ${report.avgHybridSpeedMs} ms`);
    console.log(`\nError rate (pages with 0 fields):`);
    console.log(`  CSS-only:  ${report.cssErrorRate}%`);
    console.log(`  LLM-only:  ${report.llmOnlyErrorRate}%`);
    console.log(`  Hybrid:    ${report.hybridErrorRate}%`);
    console.log(`\nCost (LLM strategies):`);
    console.log(`  LLM-only:  ${report.llmOnlyTotalTokens} tokens  ~$${report.llmOnlyEstimatedCostUsd}`);
    console.log(`  Hybrid:    ${report.hybridTotalTokens} tokens  ~$${report.hybridEstimatedCostUsd}`);
    if (report.resilience) {
      console.log(`\nResilience (structure change — field drop %):`);
      console.log(`  CSS-only:  -${report.resilience.cssDropPct}%`);
      console.log(`  LLM-only:  -${report.resilience.llmOnlyDropPct}%`);
      console.log(`  Hybrid:    -${report.resilience.hybridDropPct}%`);
    }
    console.log(`\nPer-field fill rates:`);
    for (const [field, stats] of Object.entries(report.fieldBreakdown)) {
      console.log(
        `  ${field.padEnd(24)}  css: ${String(stats.cssFillRate).padStart(3)}%  llm: ${String(stats.llmOnlyFillRate).padStart(3)}%  hybrid: ${String(stats.hybridFillRate).padStart(3)}%`
      );
    }

    if (OUTPUT_PATH) {
      await fs.writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2), "utf-8");
      console.log(`\n[benchmark] Report saved to ${OUTPUT_PATH}`);
    } else {
      console.log("\n[benchmark] Tip: set BENCHMARK_OUTPUT=./report.json to save the full report");
    }
  } finally {
    await browser.close();
  }
}

runBenchmark().catch((err) => {
  console.error("[benchmark] Fatal:", err);
  process.exit(1);
});
