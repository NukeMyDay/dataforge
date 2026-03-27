import { chromium, type Browser, type Page } from "playwright";
import * as cheerio from "cheerio";
import { createHash } from "crypto";
import { db, fundingPrograms, fundingChangelog, pipelines, pipelineRuns } from "@dataforge/db";
import { eq } from "drizzle-orm";
import { needsRescrape, recordFingerprint } from "../lib/freshness-check.js";

const BASE_URL = "https://www.foerderdatenbank.de";
const SEARCH_URL = `${BASE_URL}/SiteGlobals/FDB/Forms/Suche/Foederprogrammsuche_Formular.html`;
const REQUEST_DELAY_MS = 2000;
const MAX_PAGES = 260;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PIPELINE_NAME = "scrape-funding-bund";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[c] ?? c))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 500);
}

function makeContentHash(obj: Record<string, string | null | undefined>): string {
  const str = Object.values(obj).filter(Boolean).join("|");
  return createHash("sha256").update(str).digest("hex");
}

function deriveLevelAndState(url: string): { level: string; state: string | null } {
  const path = url.toLowerCase();
  if (path.includes("/bund/")) return { level: "bund", state: null };
  if (path.includes("/eu/")) return { level: "eu", state: null };
  const stateMatch = path.match(/\/land\/([^/]+)\//);
  if (stateMatch) {
    const stateMap: Record<string, string> = {
      "baden-wuerttemberg": "Baden-Württemberg", "bayern": "Bayern",
      "berlin": "Berlin", "brandenburg": "Brandenburg", "bremen": "Bremen",
      "hamburg": "Hamburg", "hessen": "Hessen", "mecklenburg-vorpommern": "Mecklenburg-Vorpommern",
      "niedersachsen": "Niedersachsen", "nrw": "Nordrhein-Westfalen", "nordrhein-westfalen": "Nordrhein-Westfalen",
      "rheinland-pfalz": "Rheinland-Pfalz", "saarland": "Saarland", "sachsen": "Sachsen",
      "sachsen-anhalt": "Sachsen-Anhalt", "schleswig-holstein": "Schleswig-Holstein",
      "thueringen": "Thüringen",
    };
    return { level: "land", state: stateMap[stateMatch[1]!] ?? stateMatch[1]! };
  }
  return { level: "bund", state: null };
}

function deriveCategory(fundingArea: string | null): string {
  if (!fundingArea) return "Sonstiges";
  const lower = fundingArea.toLowerCase();
  if (lower.includes("existenzgründung")) return "Existenzgründung";
  if (lower.includes("forschung") || lower.includes("innovation")) return "Forschung & Innovation";
  if (lower.includes("umwelt") || lower.includes("energie") || lower.includes("klima")) return "Umwelt & Energie";
  if (lower.includes("bildung") || lower.includes("qualifizierung")) return "Bildung & Qualifizierung";
  if (lower.includes("digitalisierung")) return "Digitalisierung";
  if (lower.includes("infrastruktur") || lower.includes("bau")) return "Infrastruktur & Bau";
  if (lower.includes("landwirtschaft") || lower.includes("agrar")) return "Landwirtschaft";
  if (lower.includes("sozial") || lower.includes("gesundheit")) return "Soziales & Gesundheit";
  if (lower.includes("kultur")) return "Kultur";
  if (lower.includes("außenwirtschaft") || lower.includes("international")) return "Internationalisierung";
  if (lower.includes("unternehmensfinanzierung")) return "Unternehmensfinanzierung";
  if (lower.includes("wohnungsbau") || lower.includes("wohnen")) return "Wohnungsbau";
  return fundingArea.split(",")[0]!.trim();
}

async function collectAllProgramUrls(page: Page): Promise<string[]> {
  const allUrls = new Set<string>();
  let consecutiveEmpty = 0;

  // Load page 1 to extract the pagination GUID
  const firstUrl = `${SEARCH_URL}?filterCategories=FundingProgram&submit=Suchen`;
  await page.goto(firstUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await sleep(REQUEST_DELAY_MS);

  let html = await page.content();
  let $ = cheerio.load(html);

  // Extract GUID from pagination links (e.g. gtp=%2526{guid}_list%253D2)
  let guid: string | null = null;
  $(".pagination a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/gtp=%2526([a-f0-9-]+)_list/);
    if (match) guid = match[1]!;
  });

  if (!guid) {
    console.warn("[fetcher] Could not extract pagination GUID, falling back to page 1 only");
  }

  // Extract links from page 1
  function extractLinks($doc: cheerio.CheerioAPI): string[] {
    const links: string[] = [];
    $doc("a[href*='FDB/Content/DE/Foerderprogramm']").each((_, el) => {
      let href = $doc(el).attr("href");
      if (!href || !href.endsWith(".html")) return;
      if (!href.startsWith("http")) href = `${BASE_URL}/${href}`;
      if (!allUrls.has(href)) links.push(href);
    });
    return links;
  }

  const firstLinks = extractLinks($);
  firstLinks.forEach((u) => allUrls.add(u));
  console.log(`[fetcher] Page 1: ${firstLinks.length} new URLs (${allUrls.size} total)`);

  if (!guid) return [...allUrls];

  // Iterate through remaining pages using the gtp parameter
  for (let pageNo = 2; pageNo <= MAX_PAGES; pageNo++) {
    const url = `${SEARCH_URL}?gtp=%2526${guid}_list%253D${pageNo}&submit=Suchen&filterCategories=FundingProgram`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await sleep(REQUEST_DELAY_MS);
      html = await page.content();
      $ = cheerio.load(html);
      const pageLinks = extractLinks($);
      pageLinks.forEach((u) => allUrls.add(u));
      if (pageLinks.length === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 3) break;
      } else {
        consecutiveEmpty = 0;
      }
      if (pageNo % 25 === 0) {
        console.log(`[fetcher] Page ${pageNo}: ${pageLinks.length} new URLs (${allUrls.size} total)`);
      }
    } catch (err) {
      console.warn(`[fetcher] Page ${pageNo} failed: ${err}. Continuing...`);
    }
  }
  console.log(`[fetcher] Collected ${allUrls.size} unique program URLs`);
  return [...allUrls];
}

interface ParsedFunding {
  titleDe: string;
  fundingType: string | null;
  fundingArea: string | null;
  fundingRegion: string | null;
  eligibleApplicants: string | null;
  contactInfo: string | null;
  summaryDe: string | null;
  descriptionDe: string | null;
  legalRequirementsDe: string | null;
  directiveDe: string | null;
  fundingAmountInfo: string | null;
  applicationProcess: string | null;
  deadlineInfo: string | null;
}

function parseFundingPage(html: string): ParsedFunding | null {
  const $ = cheerio.load(html);
  const titleDe = $("h1.ismark, h1").first().text().trim().replace(/^Förderprogramm\s*/i, "");
  if (!titleDe || titleDe.length < 3) return null;

  const meta: Record<string, string> = {};
  $("dt").each((_, el) => {
    const key = $(el).text().trim().replace(/:$/, "").toLowerCase();
    const dd = $(el).next("dd");
    if (dd.length) meta[key] = dd.text().trim();
  });

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
  const amountPatterns = [
    /(?:bis zu|maximal|höchstens)\s+(?:EUR\s+)?[\d.,]+\s*(?:Millionen|Mio|Euro|EUR|Prozent|%)/gi,
    /(?:Zuschuss|Darlehen|Förderung|Betrag)\s+(?:von\s+)?(?:bis zu\s+)?(?:EUR\s+)?[\d.,]+\s*(?:Millionen|Mio|Euro|EUR|Prozent|%)/gi,
    /[\d.,]+\s*(?:Prozent|%)\s*(?:der\s+)?(?:förderfähigen|zuwendungsfähigen)/gi,
  ];
  const amounts: string[] = [];
  for (const pattern of amountPatterns) {
    const matches = fullText.match(pattern) || [];
    amounts.push(...matches);
  }
  if (amounts.length > 0) fundingAmountInfo = [...new Set(amounts)].join("; ");

  return {
    titleDe,
    fundingType: meta["förderart"] ?? null,
    fundingArea: meta["förderbereich"] ?? null,
    fundingRegion: meta["fördergebiet"] ?? null,
    eligibleApplicants: meta["förderberechtigte"] ?? null,
    contactInfo: meta["ansprechpunkt"] ?? null,
    summaryDe, descriptionDe, legalRequirementsDe, directiveDe,
    fundingAmountInfo, applicationProcess, deadlineInfo,
  };
}

async function upsertFunding(
  parsed: ParsedFunding,
  sourceUrl: string,
  runId: number
): Promise<"new" | "updated" | "unchanged"> {
  const now = new Date();
  const { level, state } = deriveLevelAndState(sourceUrl);
  const category = deriveCategory(parsed.fundingArea);
  const slug = slugify(`${level}-${state ?? "de"}-${parsed.titleDe}`);
  const hash = makeContentHash({
    title: parsed.titleDe, summary: parsed.summaryDe,
    description: parsed.descriptionDe, requirements: parsed.legalRequirementsDe,
    directive: parsed.directiveDe, fundingType: parsed.fundingType,
    fundingArea: parsed.fundingArea, eligibleApplicants: parsed.eligibleApplicants,
  });

  const existing = await db
    .select({ id: fundingPrograms.id, version: fundingPrograms.version, contentHash: fundingPrograms.contentHash })
    .from(fundingPrograms).where(eq(fundingPrograms.sourceUrl, sourceUrl)).limit(1);

  if (existing.length > 0) {
    const current = existing[0]!;
    // Always update last_scraped_at so freshness scoring stays accurate
    if (current.contentHash === hash) {
      await db.update(fundingPrograms)
        .set({ lastScrapedAt: now })
        .where(eq(fundingPrograms.id, current.id));
      return "unchanged";
    }
    const nextVersion = current.version + 1;
    await db.update(fundingPrograms).set({
      titleDe: parsed.titleDe, fundingType: parsed.fundingType,
      fundingArea: parsed.fundingArea, fundingRegion: parsed.fundingRegion,
      eligibleApplicants: parsed.eligibleApplicants, contactInfo: parsed.contactInfo,
      summaryDe: parsed.summaryDe, descriptionDe: parsed.descriptionDe,
      legalRequirementsDe: parsed.legalRequirementsDe, directiveDe: parsed.directiveDe,
      fundingAmountInfo: parsed.fundingAmountInfo, applicationProcess: parsed.applicationProcess,
      deadlineInfo: parsed.deadlineInfo, level, state, category,
      contentHash: hash, version: nextVersion, updatedAt: now, lastScrapedAt: now,
    }).where(eq(fundingPrograms.id, current.id));
    await db.insert(fundingChangelog).values({
      fundingProgramId: current.id, version: nextVersion, changesDe: "Inhalt aktualisiert",
      contentHash: hash, scrapeRunId: runId,
    });
    return "updated";
  }

  const inserted = await db.insert(fundingPrograms).values({
    slug, titleDe: parsed.titleDe, fundingType: parsed.fundingType,
    fundingArea: parsed.fundingArea, fundingRegion: parsed.fundingRegion,
    eligibleApplicants: parsed.eligibleApplicants, contactInfo: parsed.contactInfo,
    summaryDe: parsed.summaryDe, descriptionDe: parsed.descriptionDe,
    legalRequirementsDe: parsed.legalRequirementsDe, directiveDe: parsed.directiveDe,
    fundingAmountInfo: parsed.fundingAmountInfo, applicationProcess: parsed.applicationProcess,
    deadlineInfo: parsed.deadlineInfo, level, state, category, sourceUrl,
    contentHash: hash, isActive: true, version: 1, lastScrapedAt: now,
  }).onConflictDoUpdate({
    target: fundingPrograms.slug,
    set: { titleDe: parsed.titleDe, sourceUrl, contentHash: hash, updatedAt: now, lastScrapedAt: now },
  }).returning({ id: fundingPrograms.id });

  // Record initial version in changelog for full provenance trail
  if (inserted[0]) {
    await db.insert(fundingChangelog).values({
      fundingProgramId: inserted[0].id, version: 1, changesDe: "Ersterfassung",
      contentHash: hash, scrapeRunId: runId,
    }).onConflictDoNothing();
  }

  return "new";
}

async function ensurePipeline(): Promise<number> {
  const existing = await db.select({ id: pipelines.id }).from(pipelines)
    .where(eq(pipelines.name, PIPELINE_NAME)).limit(1);
  if (existing.length > 0) return existing[0]!.id;
  const [row] = await db.insert(pipelines).values({
    name: PIPELINE_NAME,
    description: "Scrapes all German funding programs from foerderdatenbank.de (BMWi)",
    schedule: "0 2 * * 0", enabled: true,
  }).returning({ id: pipelines.id });
  return row!.id;
}

export async function scrapeFundingBund(): Promise<void> {
  console.log(`[${PIPELINE_NAME}] Pipeline starting`);
  const pipelineId = await ensurePipeline();
  const [runRow] = await db.insert(pipelineRuns)
    .values({ pipelineId, status: "running", startedAt: new Date() })
    .returning({ id: pipelineRuns.id });
  const runId = runRow!.id;

  let newCount = 0, updatedCount = 0, unchangedCount = 0, errorCount = 0;
  let errorMessage: string | null = null;
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();
    const urls = await collectAllProgramUrls(page);

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i]!;
      try {
        // Pre-scrape freshness check: skip full page load if server confirms no change
        const { needed, headers } = await needsRescrape(url);
        if (!needed) {
          unchangedCount++;
          if ((i + 1) % 50 === 0) {
            console.log(`[${PIPELINE_NAME}] Progress: ${i + 1}/${urls.length} (skipped via HEAD — cached)`);
          }
          continue;
        }

        await sleep(REQUEST_DELAY_MS);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
        const html = await page.content();
        const parsed = parseFundingPage(html);
        if (!parsed) { errorCount++; continue; }
        const result = await upsertFunding(parsed, url, runId);

        // Record fingerprint after successful scrape for future freshness checks
        const hash = makeContentHash({
          title: parsed.titleDe, summary: parsed.summaryDe,
          description: parsed.descriptionDe, requirements: parsed.legalRequirementsDe,
          directive: parsed.directiveDe, fundingType: parsed.fundingType,
          fundingArea: parsed.fundingArea, eligibleApplicants: parsed.eligibleApplicants,
        });
        await recordFingerprint(url, headers, hash, result !== "unchanged");

        if (result === "new") newCount++;
        else if (result === "updated") updatedCount++;
        else unchangedCount++;
        if ((i + 1) % 50 === 0) {
          console.log(`[${PIPELINE_NAME}] Progress: ${i + 1}/${urls.length} (new: ${newCount}, updated: ${updatedCount}, errors: ${errorCount})`);
        }
      } catch (err) {
        errorCount++;
        console.error(`[${PIPELINE_NAME}] Failed ${url}: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`[${PIPELINE_NAME}] Completed — new: ${newCount}, updated: ${updatedCount}, unchanged: ${unchangedCount}, errors: ${errorCount}`);
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[${PIPELINE_NAME}] Fatal error:`, err);
    throw err;
  } finally {
    await browser?.close();
    await db.update(pipelineRuns).set({
      status: errorMessage ? "failed" : "succeeded",
      finishedAt: new Date(),
      recordsProcessed: newCount + updatedCount, errorMessage,
    }).where(eq(pipelineRuns.id, runId));
  }
}
