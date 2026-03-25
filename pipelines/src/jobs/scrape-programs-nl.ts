import { chromium, type Browser, type Page } from "playwright";
import * as cheerio from "cheerio";
import { z } from "zod";
import { db, institutions, programs, pipelines, pipelineRuns } from "@dataforge/db";
import { eq } from "drizzle-orm";

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = "https://www.studyfinder.nl";
const SEARCH_URL = `${BASE_URL}/study/`;
const REQUEST_DELAY_MS = 2500; // respectful scraping: 2-3s between requests
const MAX_RETRIES = 3;
const USER_AGENT =
  "Mozilla/5.0 (compatible; DataForge-Bot/1.0; +https://dataforge.io/bot)";
const PIPELINE_NAME = "scrape-programs-nl";

// ─── Raw shape before validation ─────────────────────────────────────────────

interface RawProgram {
  titleNl: string | null;
  titleEn: string | null;
  degreeType: string;
  durationMonths: number | null;
  ects: number | null;
  language: string | null;
  tuitionFeeEur: number | null;
  tuitionFeeNonEuEur: number | null;
  applicationDeadlineEu: string | null;
  applicationDeadlineNonEu: string | null;
  fieldOfStudy: string | null;
  startDates: string[] | null;
  languageRequirements: Record<string, string> | null;
  numerusClausus: boolean;
  admissionRequirements: string | null;
  descriptionNl: string | null;
  descriptionEn: string | null;
  sourceUrl: string;
  institutionName: string;
  institutionCity: string | null;
  institutionWebsite: string | null;
  institutionType: string | null;
}

// ─── Zod validation schema ────────────────────────────────────────────────────

const RawProgramSchema = z.object({
  titleNl: z.string().nullable(),
  titleEn: z.string().nullable(),
  degreeType: z.enum(["bachelor", "master", "phd", "mba", "certificate", "diploma", "other"]),
  durationMonths: z.number().int().positive().nullable(),
  ects: z.number().int().positive().nullable(),
  language: z.string().nullable(),
  tuitionFeeEur: z.number().nonnegative().nullable(),
  tuitionFeeNonEuEur: z.number().nonnegative().nullable(),
  applicationDeadlineEu: z.string().nullable(),
  applicationDeadlineNonEu: z.string().nullable(),
  fieldOfStudy: z.string().nullable(),
  startDates: z.array(z.string()).nullable(),
  languageRequirements: z.record(z.string()).nullable(),
  numerusClausus: z.boolean(),
  admissionRequirements: z.string().nullable(),
  descriptionNl: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  sourceUrl: z.string().url(),
  institutionName: z.string().min(1),
  institutionCity: z.string().nullable(),
  institutionWebsite: z.string().url().nullable(),
  institutionType: z.string().nullable(),
});

type ValidatedProgram = z.infer<typeof RawProgramSchema>;

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 250);
}

function normalizeDegreeType(raw: string): ValidatedProgram["degreeType"] {
  const lower = raw.toLowerCase();
  if (lower.includes("bachelor") || lower.includes("bsc") || lower.includes("ba")) return "bachelor";
  if (lower.includes("master") || lower.includes("msc") || lower.includes("ma")) return "master";
  if (lower.includes("phd") || lower.includes("doctorate") || lower.includes("doctor")) return "phd";
  if (lower.includes("mba")) return "mba";
  if (lower.includes("certificate")) return "certificate";
  if (lower.includes("diploma")) return "diploma";
  return "other";
}

function parseDurationMonths(raw: string | null): number | null {
  if (!raw) return null;
  const yearMatch = raw.match(/(\d+(?:\.\d+)?)\s*year/i);
  if (yearMatch) return Math.round(parseFloat(yearMatch[1]!) * 12);
  const monthMatch = raw.match(/(\d+)\s*month/i);
  if (monthMatch) return parseInt(monthMatch[1]!, 10);
  const semMatch = raw.match(/(\d+)\s*semester/i);
  if (semMatch) return parseInt(semMatch[1]!, 10) * 6;
  return null;
}

function parseFeeEur(raw: string | null): number | null {
  if (!raw) return null;
  // Strip currency symbols and normalize decimal separators
  const cleaned = raw.replace(/[€$£]/g, "").replace(/\s/g, "");
  // European format: 1.234,56 -> 1234.56
  const normalized = cleaned.replace(/\.(\d{3})/g, "$1").replace(",", ".");
  const match = normalized.match(/[\d.]+/);
  if (!match) return null;
  const val = parseFloat(match[0]);
  return isNaN(val) ? null : val;
}

function parseEcts(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.match(/(\d+)/);
  return match ? parseInt(match[1]!, 10) : null;
}

// ─── Step 1: Fetcher ──────────────────────────────────────────────────────────

async function fetchWithRetry(page: Page, url: string): Promise<void> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
      return;
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.warn(`[fetcher] Attempt ${attempt} failed for ${url}: ${err}. Retrying...`);
      await sleep(REQUEST_DELAY_MS * attempt);
    }
  }
}

async function collectProgramUrls(page: Page): Promise<string[]> {
  const urls: string[] = [];
  let pageNum = 1;

  while (true) {
    const listUrl = pageNum === 1 ? SEARCH_URL : `${SEARCH_URL}?page=${pageNum}`;
    console.log(`[fetcher] Collecting list page ${pageNum}: ${listUrl}`);

    await fetchWithRetry(page, listUrl);
    await sleep(REQUEST_DELAY_MS);

    const html = await page.content();
    const $ = cheerio.load(html);

    const pageUrls: string[] = [];
    $("a[href*='/study/']").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
      // Exclude the listing page itself; only keep individual program pages
      if (
        fullUrl !== SEARCH_URL &&
        fullUrl !== `${BASE_URL}/study` &&
        !fullUrl.includes("?") &&
        !pageUrls.includes(fullUrl)
      ) {
        pageUrls.push(fullUrl);
      }
    });

    if (pageUrls.length === 0) break;
    for (const u of pageUrls) {
      if (!urls.includes(u)) urls.push(u);
    }

    const hasNext =
      $("a[rel='next']").length > 0 ||
      $(".pagination__next:not([aria-disabled])").length > 0 ||
      $("a[aria-label='Next page']").length > 0;
    if (!hasNext) break;
    pageNum++;
    if (pageNum > 200) break; // safety cap
  }

  return urls;
}

// ─── Step 2: Parser ───────────────────────────────────────────────────────────

function parseProgramPage(html: string, sourceUrl: string): Partial<RawProgram> {
  const $ = cheerio.load(html);

  const titleNl =
    $("h1.program-title, h1.course-title, [data-field='title']").first().text().trim() || null;
  const titleEn =
    $("[lang='en'] h1, .title-en, [data-field='title-en']").first().text().trim() || null;

  const degreeRaw =
    $(".degree-type, [data-field='degree'], .program-type").first().text().trim() ||
    $("dt:contains('Type'), dt:contains('Degree')").next("dd").first().text().trim() ||
    "";
  const degreeType = normalizeDegreeType(degreeRaw);

  const durationRaw =
    $(".duration, [data-field='duration']").first().text().trim() ||
    $("dt:contains('Duration'), dt:contains('Duur')").next("dd").first().text().trim() ||
    null;
  const durationMonths = parseDurationMonths(durationRaw);

  const ectsRaw =
    $(".ects, [data-field='ects']").first().text().trim() ||
    $("dt:contains('ECTS'), dt:contains('Credits')").next("dd").first().text().trim() ||
    null;
  const ects = parseEcts(ectsRaw);

  const language =
    $(".language, [data-field='language']").first().text().trim() ||
    $("dt:contains('Language'), dt:contains('Taal')").next("dd").first().text().trim() ||
    null;

  const feeEuRaw =
    $(".tuition-eu, [data-field='tuition-eu']").first().text().trim() ||
    $("dt:contains('EU tuition'), dt:contains('EER')").next("dd").first().text().trim() ||
    null;
  const feeNonEuRaw =
    $(".tuition-non-eu, [data-field='tuition-non-eu']").first().text().trim() ||
    $("dt:contains('Non-EU'), dt:contains('niet-EER')").next("dd").first().text().trim() ||
    null;

  const fieldOfStudy =
    $(".field-of-study, [data-field='field']").first().text().trim() ||
    $("dt:contains('Field'), dt:contains('Sector'), dt:contains('Richting')").next("dd").first().text().trim() ||
    null;

  const numerusClausus =
    $(".numerus-clausus, [data-field='numerus-clausus']").length > 0 ||
    $("body").text().toLowerCase().includes("numerus fixus");

  const descriptionNl =
    $("[lang='nl'] .description, .program-description-nl, .omschrijving").first().text().trim() || null;
  const descriptionEn =
    $("[lang='en'] .description, .program-description-en, .description, .about-program")
      .first()
      .text()
      .trim() || null;

  const institutionName =
    $(".institution-name, .university-name, [data-field='institution']").first().text().trim() ||
    $("a[href*='/university/'], a[href*='/institution/']").first().text().trim() ||
    "";

  const institutionCity =
    $(".institution-city, .university-city, [data-field='city']").first().text().trim() || null;

  const institutionWebsiteRaw =
    $("a.institution-website, a[data-field='website']").attr("href") ?? null;
  const institutionWebsite =
    institutionWebsiteRaw?.startsWith("http") ? institutionWebsiteRaw : null;

  const institutionTypeRaw =
    $(".institution-type, [data-field='institution-type']").first().text().trim().toLowerCase();
  let institutionType: string | null = null;
  if (institutionTypeRaw.includes("university of applied") || institutionTypeRaw.includes("hogeschool")) {
    institutionType = "university_of_applied_sciences";
  } else if (institutionTypeRaw.includes("university") || institutionTypeRaw.includes("universiteit")) {
    institutionType = "university";
  } else if (institutionTypeRaw) {
    institutionType = "college";
  }

  const deadlineEuRaw =
    $(".deadline-eu, [data-field='deadline-eu']").first().text().trim() ||
    $("dt:contains('EU deadline'), dt:contains('Aanmelding EU')").next("dd").first().text().trim() ||
    null;
  const deadlineNonEuRaw =
    $(".deadline-non-eu, [data-field='deadline-non-eu']").first().text().trim() ||
    $("dt:contains('Non-EU deadline')").next("dd").first().text().trim() ||
    null;

  const startDates: string[] = [];
  $(".start-date, [data-field='start-date']").each((_, el) => {
    const text = $(el).text().trim();
    if (text) startDates.push(text);
  });

  // Extract language requirements (IELTS/TOEFL from both structured and plain text)
  const langReqs: Record<string, string> = {};
  $(".language-requirement, [data-field='lang-req']").each((_, el) => {
    const label = $(el).find(".label, dt").first().text().trim().toLowerCase();
    const value = $(el).find(".value, dd").first().text().trim();
    if (label && value) langReqs[label] = value;
  });
  const langText = $(".language-requirements, .english-requirements").first().text();
  const ieltsMatch = langText.match(/ielts[:\s]+(\d+(?:\.\d+)?)/i);
  const toeflMatch = langText.match(/toefl[:\s]+(\d+)/i);
  if (ieltsMatch?.[1]) langReqs["ielts"] = ieltsMatch[1];
  if (toeflMatch?.[1]) langReqs["toefl"] = toeflMatch[1];

  const admissionRequirements =
    $(".admission-requirements, .toelatingseisen").first().text().trim() || null;

  return {
    titleNl,
    titleEn: titleEn ?? titleNl, // fall back to NL title when no EN available
    degreeType,
    durationMonths,
    ects,
    language: language || "Dutch",
    tuitionFeeEur: parseFeeEur(feeEuRaw),
    tuitionFeeNonEuEur: parseFeeEur(feeNonEuRaw),
    applicationDeadlineEu: deadlineEuRaw,
    applicationDeadlineNonEu: deadlineNonEuRaw,
    fieldOfStudy: fieldOfStudy || null,
    startDates: startDates.length > 0 ? startDates : null,
    languageRequirements: Object.keys(langReqs).length > 0 ? langReqs : null,
    numerusClausus,
    admissionRequirements,
    descriptionNl,
    descriptionEn,
    sourceUrl,
    institutionName,
    institutionCity,
    institutionWebsite,
    institutionType,
  };
}

// ─── Step 3: Validator ────────────────────────────────────────────────────────

interface ValidateResult {
  data: ValidatedProgram;
  lowConfidenceFields: string[];
}

function validateProgram(raw: Partial<RawProgram>, url: string): ValidateResult | null {
  if (!raw.titleNl && !raw.titleEn) {
    console.warn(`[validator] No title found for ${url} — skipping`);
    return null;
  }
  if (!raw.institutionName) {
    console.warn(`[validator] No institution name for ${url} — skipping`);
    return null;
  }

  const lowConfidenceFields: string[] = [];
  if (!raw.durationMonths) lowConfidenceFields.push("durationMonths");
  if (!raw.ects) lowConfidenceFields.push("ects");
  if (raw.tuitionFeeEur === null && raw.tuitionFeeNonEuEur === null) {
    lowConfidenceFields.push("tuitionFee");
  }

  const candidate = {
    titleNl: raw.titleNl ?? null,
    titleEn: raw.titleEn ?? null,
    degreeType: (raw.degreeType ?? "other") as ValidatedProgram["degreeType"],
    durationMonths: raw.durationMonths ?? null,
    ects: raw.ects ?? null,
    language: raw.language ?? null,
    tuitionFeeEur: raw.tuitionFeeEur ?? null,
    tuitionFeeNonEuEur: raw.tuitionFeeNonEuEur ?? null,
    applicationDeadlineEu: raw.applicationDeadlineEu ?? null,
    applicationDeadlineNonEu: raw.applicationDeadlineNonEu ?? null,
    fieldOfStudy: raw.fieldOfStudy ?? null,
    startDates: raw.startDates ?? null,
    languageRequirements: raw.languageRequirements ?? null,
    numerusClausus: raw.numerusClausus ?? false,
    admissionRequirements: raw.admissionRequirements ?? null,
    descriptionNl: raw.descriptionNl ?? null,
    descriptionEn: raw.descriptionEn ?? null,
    sourceUrl: raw.sourceUrl ?? url,
    institutionName: raw.institutionName,
    institutionCity: raw.institutionCity ?? null,
    institutionWebsite: raw.institutionWebsite ?? null,
    institutionType: raw.institutionType ?? null,
  };

  const result = RawProgramSchema.safeParse(candidate);
  if (!result.success) {
    console.warn(
      `[validator] Schema errors for ${url}:`,
      result.error.flatten().fieldErrors
    );
    lowConfidenceFields.push("schema_errors");
    // Log but don't fully discard — partial data is still useful
  }

  return { data: candidate, lowConfidenceFields };
}

// ─── Step 4: Differ ───────────────────────────────────────────────────────────

async function diffProgram(
  validated: ValidatedProgram
): Promise<"new" | "updated" | "unchanged"> {
  const existing = await db
    .select()
    .from(programs)
    .where(eq(programs.sourceUrl, validated.sourceUrl))
    .limit(1);

  if (existing.length === 0) return "new";

  const row = existing[0]!;
  const changed =
    row.titleNl !== validated.titleNl ||
    row.titleEn !== validated.titleEn ||
    row.degreeType !== validated.degreeType ||
    row.durationMonths !== validated.durationMonths ||
    row.ects !== validated.ects ||
    row.language !== validated.language ||
    String(row.tuitionFeeEur ?? "") !== String(validated.tuitionFeeEur ?? "");

  return changed ? "updated" : "unchanged";
}

// ─── Step 5: Writer ───────────────────────────────────────────────────────────

async function upsertInstitution(validated: ValidatedProgram): Promise<number> {
  const slug = slugify(`${validated.institutionName}-nl`);
  const instType = (validated.institutionType as
    | "university"
    | "university_of_applied_sciences"
    | "college"
    | null) ?? null;

  const existing = await db
    .select({ id: institutions.id })
    .from(institutions)
    .where(eq(institutions.slug, slug))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(institutions)
      .set({
        nameNl: validated.institutionName,
        nameEn: validated.institutionName,
        city: validated.institutionCity,
        websiteUrl: validated.institutionWebsite,
        type: instType,
        updatedAt: new Date(),
      })
      .where(eq(institutions.slug, slug));
    return existing[0]!.id;
  }

  const inserted = await db
    .insert(institutions)
    .values({
      nameNl: validated.institutionName,
      nameEn: validated.institutionName,
      city: validated.institutionCity,
      websiteUrl: validated.institutionWebsite,
      type: instType,
      country: "NL",
      slug,
      accreditationStatus: "accredited",
    })
    .returning({ id: institutions.id });

  return inserted[0]!.id;
}

async function upsertProgram(validated: ValidatedProgram, institutionId: number): Promise<void> {
  const titleForSlug = validated.titleNl ?? validated.titleEn ?? "program";
  const slug = slugify(`${validated.institutionName}-${titleForSlug}-nl`);

  const toDate = (s: string | null): Date | undefined => {
    if (!s) return undefined;
    const d = new Date(s);
    return isNaN(d.getTime()) ? undefined : d;
  };

  const values = {
    institutionId,
    titleNl: validated.titleNl,
    titleEn: validated.titleEn,
    degreeType: validated.degreeType,
    durationMonths: validated.durationMonths,
    ects: validated.ects,
    language: validated.language,
    tuitionFeeEur:
      validated.tuitionFeeEur !== null ? String(validated.tuitionFeeEur) : null,
    tuitionFeeNonEuEur:
      validated.tuitionFeeNonEuEur !== null ? String(validated.tuitionFeeNonEuEur) : null,
    applicationDeadlineEu: toDate(validated.applicationDeadlineEu) ?? null,
    applicationDeadlineNonEu: toDate(validated.applicationDeadlineNonEu) ?? null,
    fieldOfStudy: validated.fieldOfStudy,
    startDates: validated.startDates ? JSON.stringify(validated.startDates) : null,
    languageRequirements: validated.languageRequirements
      ? JSON.stringify(validated.languageRequirements)
      : null,
    numerusClausus: validated.numerusClausus,
    admissionRequirements: validated.admissionRequirements,
    descriptionNl: validated.descriptionNl,
    descriptionEn: validated.descriptionEn,
    sourceUrl: validated.sourceUrl,
    country: "NL" as const,
    slug,
    isActive: true,
    updatedAt: new Date(),
  };

  const existing = await db
    .select({ id: programs.id })
    .from(programs)
    .where(eq(programs.sourceUrl, validated.sourceUrl))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(programs)
      .set(values)
      .where(eq(programs.sourceUrl, validated.sourceUrl));
  } else {
    await db
      .insert(programs)
      .values({ ...values, createdAt: new Date() })
      .onConflictDoUpdate({ target: programs.slug, set: values });
  }
}

// ─── Pipeline setup helpers ───────────────────────────────────────────────────

async function ensurePipeline(): Promise<number> {
  const existing = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(eq(pipelines.name, PIPELINE_NAME))
    .limit(1);

  if (existing.length > 0) return existing[0]!.id;

  const inserted = await db
    .insert(pipelines)
    .values({
      name: PIPELINE_NAME,
      description: "Scrapes Dutch study programs from studyfinder.nl",
      schedule: "0 3 * * 1", // every Monday at 03:00
      enabled: true,
    })
    .returning({ id: pipelines.id });

  return inserted[0]!.id;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function scrapeProgramsNl(): Promise<void> {
  console.log(`[${PIPELINE_NAME}] Pipeline starting`);

  const pipelineId = await ensurePipeline();

  const [runRow] = await db
    .insert(pipelineRuns)
    .values({ pipelineId, status: "running", startedAt: new Date() })
    .returning({ id: pipelineRuns.id });
  const runId = runRow!.id;

  let recordsProcessed = 0;
  let newCount = 0;
  let updatedCount = 0;
  let unchangedCount = 0;
  let errorMessage: string | null = null;
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT });
    const page = await context.newPage();

    // Step 1: collect program URLs from search/listing pages
    const programUrls = await collectProgramUrls(page);
    console.log(`[${PIPELINE_NAME}] Collected ${programUrls.length} program URLs`);

    for (const url of programUrls) {
      try {
        await sleep(REQUEST_DELAY_MS);
        await fetchWithRetry(page, url);
        const html = await page.content();

        // Step 2: parse
        const raw = parseProgramPage(html, url);

        // Step 3: validate
        const validated = validateProgram(raw, url);
        if (!validated) continue;

        if (validated.lowConfidenceFields.length > 0) {
          console.warn(
            `[${PIPELINE_NAME}] Low confidence fields for ${url}: ${validated.lowConfidenceFields.join(", ")}`
          );
        }

        // Step 4: diff
        const diffResult = await diffProgram(validated.data);
        if (diffResult === "unchanged") {
          unchangedCount++;
          continue;
        }

        // Step 5: write (upsert institution first, then program)
        const institutionId = await upsertInstitution(validated.data);
        await upsertProgram(validated.data, institutionId);

        recordsProcessed++;
        if (diffResult === "new") newCount++;
        else updatedCount++;
      } catch (err) {
        // Partial success: log failure and continue with remaining programs
        console.error(`[${PIPELINE_NAME}] Failed to process ${url}:`, err);
      }
    }

    console.log(
      `[${PIPELINE_NAME}] Completed — new: ${newCount}, updated: ${updatedCount}, unchanged: ${unchangedCount}`
    );
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[${PIPELINE_NAME}] Fatal error:`, err);
    throw err;
  } finally {
    await browser?.close();
    await db
      .update(pipelineRuns)
      .set({
        status: errorMessage ? "failed" : "succeeded",
        finishedAt: new Date(),
        recordsProcessed,
        errorMessage,
      })
      .where(eq(pipelineRuns.id, runId));
  }
}
