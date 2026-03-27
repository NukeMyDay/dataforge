/**
 * LLM Extraction Benchmark — DAT-48
 *
 * Compares CSS-only vs. hybrid (CSS + LLM fallback) extraction on a sample of
 * foerderdatenbank.de pages. Produces a JSON report with:
 *   - Fields extracted per approach per page
 *   - LLM fill rate for CSS-missed fields
 *   - Token cost and wall-clock time
 *   - Resilience test: simulated CSS class rename
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... tsx src/jobs/llm-extraction-benchmark.ts
 *
 * Optional env vars:
 *   BENCHMARK_SAMPLE_SIZE=50   (default: 50)
 *   BENCHMARK_RESILIENCE=true  (default: true — run resilience test)
 *   BENCHMARK_OUTPUT=./benchmark-report.json (default: stdout)
 */
import { chromium } from "playwright";
import * as cheerio from "cheerio";
import * as fs from "node:fs/promises";
import { extractFieldsWithLLM, type FieldSchema, type HybridExtractionLog } from "../lib/llm-extractor.js";

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.foerderdatenbank.de";
const SEARCH_URL = `${BASE_URL}/SiteGlobals/FDB/Forms/Suche/Foederprogrammsuche_Formular.html`;
const SAMPLE_SIZE = parseInt(process.env.BENCHMARK_SAMPLE_SIZE ?? "50", 10);
const RUN_RESILIENCE = process.env.BENCHMARK_RESILIENCE !== "false";
const OUTPUT_PATH = process.env.BENCHMARK_OUTPUT ?? null;
const REQUEST_DELAY_MS = 1500;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";

// Fields we care about for comparison
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

// LLM field schemas (same as in scrape-funding-bund.ts)
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

// ─── CSS extraction (mirrors scrape-funding-bund logic) ───────────────────────

interface ParsedFunding {
  titleDe: string | null;
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
  const titleDe = $("h1.ismark, h1").first().text().trim() || null;

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

  return { titleDe, summaryDe, descriptionDe, legalRequirementsDe, directiveDe, applicationProcess, deadlineInfo, fundingAmountInfo };
}

/**
 * Simulate a page structure change by renaming the h2/h3 elements to h4/h5.
 * This breaks all heading-based CSS selectors while leaving page content intact.
 */
function simulateStructureChange(html: string): string {
  return html
    .replace(/<h2(\s|>)/gi, "<h4$1")
    .replace(/<\/h2>/gi, "</h4>")
    .replace(/<h3(\s|>)/gi, "<h5$1")
    .replace(/<\/h3>/gi, "</h5>");
}

// ─── Metrics helpers ──────────────────────────────────────────────────────────

function countFilledFields(record: ParsedFunding): number {
  return TRACKED_FIELDS.filter((f) => record[f] !== null).length;
}

function fieldFillMap(record: ParsedFunding): Record<TrackedField, boolean> {
  return Object.fromEntries(
    TRACKED_FIELDS.map((f) => [f, record[f] !== null])
  ) as Record<TrackedField, boolean>;
}

// ─── URL collection (reuse logic from scrape-funding-bund) ───────────────────

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
  let page2 = 2;
  while (urls.size < limit && guid) {
    const url = `${SEARCH_URL}?gtp=%2526${guid}_list%253D${page2}&submit=Suchen&filterCategories=FundingProgram`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
    html = await page.content();
    $ = cheerio.load(html);
    const before = urls.size;
    extractLinks($);
    if (urls.size === before) break;
    page2++;
  }

  return [...urls].slice(0, limit);
}

// ─── Main benchmark ───────────────────────────────────────────────────────────

interface PageResult {
  url: string;
  css: { fieldsFound: number; fields: Record<TrackedField, boolean> };
  hybrid: { fieldsFound: number; fields: Record<TrackedField, boolean>; tokensUsed: number; durationMs: number };
  improvement: number; // hybrid - css fields
}

interface ResilienceResult {
  url: string;
  cssOnOriginal: number;
  cssOnModified: number;
  llmOnModified: number;
}

interface BenchmarkReport {
  runDate: string;
  sampleSize: number;
  averageCssFieldsPerPage: number;
  averageHybridFieldsPerPage: number;
  averageImprovementPerPage: number;
  llmFillRate: number; // % of LLM-attempted fields that were filled
  totalTokensUsed: number;
  estimatedCostUsd: number;
  fieldBreakdown: Record<
    TrackedField,
    { cssFillRate: number; hybridFillRate: number; llmContribution: number }
  >;
  resilience?: {
    cssDropOnChange: number; // average field count drop when structure changed
    llmRecoveryRate: number; // % of dropped fields LLM recovered
    result: ResilienceResult;
  };
  pages: PageResult[];
}

async function runBenchmark(): Promise<void> {
  console.log(`[benchmark] Starting LLM extraction benchmark`);
  console.log(`[benchmark] Sample size: ${SAMPLE_SIZE} pages`);
  console.log(
    `[benchmark] Resilience test: ${RUN_RESILIENCE ? "enabled" : "disabled"}`
  );

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY must be set to run the benchmark");
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: USER_AGENT });
  const page = await context.newPage();

  try {
    // Collect URLs
    console.log(`[benchmark] Collecting ${SAMPLE_SIZE} program URLs...`);
    const urls = await collectSampleUrls(page, SAMPLE_SIZE);
    console.log(`[benchmark] Got ${urls.length} URLs`);

    const pageResults: PageResult[] = [];
    let totalLlmTokens = 0;
    let llmAttempted = 0;
    let llmFilled = 0;

    // Per-field accumulators
    const fieldCssFills: Record<TrackedField, number> = Object.fromEntries(
      TRACKED_FIELDS.map((f) => [f, 0])
    ) as Record<TrackedField, number>;
    const fieldHybridFills: Record<TrackedField, number> = Object.fromEntries(
      TRACKED_FIELDS.map((f) => [f, 0])
    ) as Record<TrackedField, number>;

    // Process each page
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]!;
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
        const html = await page.content();

        // Phase 1: CSS-only
        const cssResult = parseCssOnly(html);
        const cssFills = fieldFillMap(cssResult);

        // Phase 2: LLM fallback for null fields
        const missingFields = TRACKED_FIELDS.filter((f) => !cssFills[f]);
        const hybridFields = { ...cssFills };
        let tokensUsed = 0;
        let durationMs = 0;

        if (missingFields.length > 0) {
          const schemas: Record<string, FieldSchema> = {};
          for (const f of missingFields) schemas[f] = FIELD_SCHEMAS[f];
          const llmResult = await extractFieldsWithLLM({ html, fields: schemas });
          tokensUsed = llmResult.tokensInput + llmResult.tokensOutput;
          durationMs = llmResult.durationMs;
          totalLlmTokens += tokensUsed;
          llmAttempted += missingFields.length;

          for (const f of missingFields) {
            if (llmResult.fields[f]) {
              hybridFields[f] = true;
              llmFilled++;
            }
          }
        }

        // Accumulate per-field stats
        for (const f of TRACKED_FIELDS) {
          if (cssFills[f]) fieldCssFills[f]++;
          if (hybridFields[f]) fieldHybridFills[f]++;
        }

        const cssCount = TRACKED_FIELDS.filter((f) => cssFills[f]).length;
        const hybridCount = TRACKED_FIELDS.filter((f) => hybridFields[f]).length;

        pageResults.push({
          url,
          css: {
            fieldsFound: cssCount,
            fields: cssFills,
          },
          hybrid: {
            fieldsFound: hybridCount,
            fields: hybridFields as Record<TrackedField, boolean>,
            tokensUsed,
            durationMs,
          },
          improvement: hybridCount - cssCount,
        });

        if ((i + 1) % 10 === 0) {
          console.log(
            `[benchmark] Progress: ${i + 1}/${urls.length} — avg CSS fields: ${(pageResults.reduce((s, r) => s + r.css.fieldsFound, 0) / pageResults.length).toFixed(1)}, avg hybrid: ${(pageResults.reduce((s, r) => s + r.hybrid.fieldsFound, 0) / pageResults.length).toFixed(1)}`
          );
        }
      } catch (err) {
        console.warn(`[benchmark] Failed ${url}: ${err}`);
      }
    }

    // ── Resilience test ──────────────────────────────────────────────────────
    let resilienceData: BenchmarkReport["resilience"] | undefined;
    if (RUN_RESILIENCE && pageResults.length > 0) {
      console.log(`[benchmark] Running resilience test...`);
      const testUrl = pageResults[0]!.url;
      await page.goto(testUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      const originalHtml = await page.content();

      // Simulate: rename h2/h3 → h4/h5 (breaks all heading-based CSS selectors)
      const modifiedHtml = simulateStructureChange(originalHtml);

      const cssOriginal = parseCssOnly(originalHtml);
      const cssModified = parseCssOnly(modifiedHtml);
      const cssOriginalCount = countFilledFields(cssOriginal);
      const cssModifiedCount = countFilledFields(cssModified);
      const dropped = cssOriginalCount - cssModifiedCount;

      // LLM on the modified (structurally changed) HTML
      const missingAfterChange = TRACKED_FIELDS.filter(
        (f) => cssModified[f] === null
      );
      const schemas: Record<string, FieldSchema> = {};
      for (const f of missingAfterChange) schemas[f] = FIELD_SCHEMAS[f];
      const llmResult = await extractFieldsWithLLM({
        html: modifiedHtml,
        fields: schemas,
      });
      const llmRecovered = Object.values(llmResult.fields).filter(Boolean).length;

      resilienceData = {
        cssDropOnChange: dropped,
        llmRecoveryRate:
          dropped > 0 ? Math.round((llmRecovered / dropped) * 100) : 100,
        result: {
          url: testUrl,
          cssOnOriginal: cssOriginalCount,
          cssOnModified: cssModifiedCount,
          llmOnModified: cssModifiedCount + llmRecovered,
        },
      };

      console.log(
        `[benchmark] Resilience: CSS fields original=${cssOriginalCount}, ` +
          `after structure change=${cssModifiedCount} (dropped ${dropped}), ` +
          `LLM recovered=${llmRecovered}/${dropped} (${resilienceData.llmRecoveryRate}%)`
      );
    }

    // ── Build report ─────────────────────────────────────────────────────────
    const n = pageResults.length;
    const avgCss = pageResults.reduce((s, r) => s + r.css.fieldsFound, 0) / n;
    const avgHybrid =
      pageResults.reduce((s, r) => s + r.hybrid.fieldsFound, 0) / n;
    const avgImprovement =
      pageResults.reduce((s, r) => s + r.improvement, 0) / n;
    const llmFillRate =
      llmAttempted > 0
        ? Math.round((llmFilled / llmAttempted) * 100)
        : 0;
    // Haiku blended estimate: $1/1M input + $5/1M output ≈ $3/1M blended
    const estimatedCostUsd =
      Math.round(((totalLlmTokens / 1_000_000) * 3.0) * 10000) / 10000;

    const fieldBreakdown: BenchmarkReport["fieldBreakdown"] =
      Object.fromEntries(
        TRACKED_FIELDS.map((f) => [
          f,
          {
            cssFillRate: Math.round((fieldCssFills[f] / n) * 100),
            hybridFillRate: Math.round((fieldHybridFills[f] / n) * 100),
            llmContribution: fieldHybridFills[f] - fieldCssFills[f],
          },
        ])
      ) as BenchmarkReport["fieldBreakdown"];

    const report: BenchmarkReport = {
      runDate: new Date().toISOString(),
      sampleSize: n,
      averageCssFieldsPerPage: Math.round(avgCss * 100) / 100,
      averageHybridFieldsPerPage: Math.round(avgHybrid * 100) / 100,
      averageImprovementPerPage: Math.round(avgImprovement * 100) / 100,
      llmFillRate,
      totalTokensUsed: totalLlmTokens,
      estimatedCostUsd,
      fieldBreakdown,
      ...(resilienceData ? { resilience: resilienceData } : {}),
      pages: pageResults,
    };

    console.log(`\n[benchmark] === RESULTS ===`);
    console.log(`Pages tested:           ${n}`);
    console.log(
      `Avg fields/page — CSS:  ${report.averageCssFieldsPerPage.toFixed(2)}/${TRACKED_FIELDS.length}`
    );
    console.log(
      `Avg fields/page — hybrid: ${report.averageHybridFieldsPerPage.toFixed(2)}/${TRACKED_FIELDS.length}`
    );
    console.log(
      `Average improvement:    +${report.averageImprovementPerPage.toFixed(2)} fields/page`
    );
    console.log(`LLM fill rate:          ${report.llmFillRate}%`);
    console.log(`Total tokens used:      ${report.totalTokensUsed}`);
    console.log(`Estimated cost:         $${report.estimatedCostUsd}`);
    if (report.resilience) {
      console.log(
        `Resilience — CSS drop:  ${report.resilience.cssDropOnChange} fields`
      );
      console.log(
        `Resilience — LLM recovery: ${report.resilience.llmRecoveryRate}%`
      );
    }
    console.log(`\nPer-field breakdown:`);
    for (const [field, stats] of Object.entries(report.fieldBreakdown)) {
      console.log(
        `  ${field.padEnd(24)} CSS: ${stats.cssFillRate}%  hybrid: ${stats.hybridFillRate}%  (+${stats.llmContribution} pages via LLM)`
      );
    }

    if (OUTPUT_PATH) {
      await fs.writeFile(
        OUTPUT_PATH,
        JSON.stringify(report, null, 2),
        "utf-8"
      );
      console.log(`\n[benchmark] Report saved to ${OUTPUT_PATH}`);
    } else {
      console.log(
        "\n[benchmark] Set BENCHMARK_OUTPUT=./report.json to save full report"
      );
    }
  } finally {
    await browser.close();
  }
}

// Run if invoked directly
runBenchmark().catch((err) => {
  console.error("[benchmark] Fatal:", err);
  process.exit(1);
});
