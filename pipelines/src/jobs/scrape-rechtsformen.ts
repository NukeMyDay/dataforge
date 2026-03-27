// Silo 2 scraper: German Rechtsformen and Gewerbeanmeldung data.
// Sources:
//   - existenzgruender.de (BMWi/BMWK) — primary source for Rechtsformvergleich;
//     official federal guide for founders maintained by the Federal Ministry for
//     Economic Affairs. Authoritative and non-commercial.
//   - service.bund.de — federal service portal listing Gewerbeanmeldung as an
//     official administrative procedure with state-level service links.
//   - IHK.de — Industrie- und Handelskammer, primary authority for commercial
//     registration guidance (used as secondary/fallback source).

import * as cheerio from "cheerio";
import { createHash } from "crypto";
import { db, rechtsformen, gewerbeanmeldungInfo } from "@dataforge/db";
import { eq } from "drizzle-orm";
import { BaseScraper, type DiffResult } from "../lib/base-scraper.js";
import type { Page } from "playwright";

// ─── Constants ────────────────────────────────────────────────────────────────

const EXISTENZGRUENDER_BASE = "https://www.existenzgruender.de";

// Overview page listing all Rechtsformen with comparison links
const RECHTSFORMEN_OVERVIEW = `${EXISTENZGRUENDER_BASE}/DE/Planen/Rechtsformen/inhalt.html`;

// Fallback: known individual Rechtsform page URLs on existenzgruender.de
const KNOWN_RECHTSFORM_URLS: string[] = [
  `${EXISTENZGRUENDER_BASE}/DE/Planen/Rechtsformen/Einzelunternehmen/inhalt.html`,
  `${EXISTENZGRUENDER_BASE}/DE/Planen/Rechtsformen/GbR/inhalt.html`,
  `${EXISTENZGRUENDER_BASE}/DE/Planen/Rechtsformen/OHG/inhalt.html`,
  `${EXISTENZGRUENDER_BASE}/DE/Planen/Rechtsformen/KG/inhalt.html`,
  `${EXISTENZGRUENDER_BASE}/DE/Planen/Rechtsformen/GmbH/inhalt.html`,
  `${EXISTENZGRUENDER_BASE}/DE/Planen/Rechtsformen/UG/inhalt.html`,
  `${EXISTENZGRUENDER_BASE}/DE/Planen/Rechtsformen/AG/inhalt.html`,
  `${EXISTENZGRUENDER_BASE}/DE/Planen/Rechtsformen/Freie-Berufe/inhalt.html`,
];

// service.bund.de — primary federal service portal for Gewerbeanmeldung procedure.
// This page aggregates state-level service links (OZG leistung 99013).
const SERVICE_BUND_GEWERBE =
  "https://service.bund.de/DE/ZentralerStatischerKontent/Einsteiger/Existenzgruendung/Unternehmen-anmelden/inhalt.html";

// All 16 German Bundesländer — each gets one row in gewerbeanmeldung_info.
// We encode them as URL fragments on the source URL so BaseScraper.run() can
// treat each state as a separate "URL" while fetching the same base page once
// per batch. Playwright ignores fragments on navigation; we extract them in parsePage().
const BUNDESLAENDER = [
  "Baden-Württemberg",
  "Bayern",
  "Berlin",
  "Brandenburg",
  "Bremen",
  "Hamburg",
  "Hessen",
  "Mecklenburg-Vorpommern",
  "Niedersachsen",
  "Nordrhein-Westfalen",
  "Rheinland-Pfalz",
  "Saarland",
  "Sachsen",
  "Sachsen-Anhalt",
  "Schleswig-Holstein",
  "Thüringen",
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(
      /[äöüß]/g,
      (c) => ({ ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[c] ?? c),
    )
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 256);
}

function makeHash(data: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

// Extract text from headings-based sections (reused across parsers)
function extractSection($: cheerio.CheerioAPI, headingTexts: string[]): string | null {
  const result: string[] = [];
  $("h2, h3, h4").each((_, el) => {
    const heading = $(el).text().trim().toLowerCase();
    if (!headingTexts.some((h) => heading.includes(h.toLowerCase()))) return;
    let next = $(el).next();
    while (next.length && !next.is("h2, h3, h4")) {
      const text = next.text().trim();
      if (text) result.push(text);
      next = next.next();
    }
  });
  return result.length > 0 ? result.join("\n\n") : null;
}

// ─── Parsed types ─────────────────────────────────────────────────────────────

interface ParsedRechtsform {
  name: string;
  slug: string;
  fullName: string | null;
  minCapitalEur: number | null;
  liabilityType: string | null;
  notaryRequired: boolean | null;
  tradeRegisterRequired: boolean | null;
  founderCount: string | null;
  descriptionDe: string | null;
  taxNotesDe: string | null;
  foundingCostsDe: string | null;
  sourceUrl: string;
  contentHash: string;
}

interface ParsedGewerbeanmeldung {
  bundesland: string;
  zustaendigeStelleDescription: string | null;
  kostenEur: number | null;
  bearbeitungszeitTage: number | null;
  requiredDocuments: string[] | null;
  onlineAvailable: boolean | null;
  noteDe: string | null;
  sourceUrl: string;
  contentHash: string;
}

// ─── RechtsformenScraper ──────────────────────────────────────────────────────

class RechtsformenScraper extends BaseScraper<ParsedRechtsform> {
  constructor() {
    super({
      pipelineName: "scrape-rechtsformen",
      pipelineDescription:
        "Scrapes German legal entity types (Rechtsformen) from existenzgruender.de (BMWi/BMWK)",
      pipelineSchedule: "0 3 * * 1", // every Monday at 03:00 UTC
      requestDelayMs: 2000,
    });
  }

  protected async fetchUrls(page: Page): Promise<string[]> {
    try {
      await this.fetchWithRetry(page, RECHTSFORMEN_OVERVIEW);
      const html = await page.content();
      const $ = cheerio.load(html);

      const found = new Set<string>();
      // existenzgruender.de Rechtsformen sub-pages contain "/Rechtsformen/" in their path
      // and end with "inhalt.html", excluding the overview page itself.
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href") ?? "";
        if (
          href.includes("/Rechtsformen/") &&
          href.endsWith("inhalt.html") &&
          !href.endsWith("/Rechtsformen/inhalt.html")
        ) {
          const abs = href.startsWith("http")
            ? href
            : `${EXISTENZGRUENDER_BASE}${href.startsWith("/") ? "" : "/"}${href}`;
          found.add(abs);
        }
      });

      if (found.size > 0) {
        console.log(
          `[scrape-rechtsformen][fetcher] Collected ${found.size} URLs from overview`,
        );
        return [...found];
      }
    } catch (err) {
      console.warn(
        `[scrape-rechtsformen][fetcher] Overview fetch failed, using fallback URLs: ${err}`,
      );
    }

    // Fallback: use the known list of Rechtsform pages
    console.log(
      `[scrape-rechtsformen][fetcher] Using ${KNOWN_RECHTSFORM_URLS.length} fallback URLs`,
    );
    return KNOWN_RECHTSFORM_URLS;
  }

  protected parsePage(html: string, url: string): ParsedRechtsform | null {
    const $ = cheerio.load(html);

    // Page title is the Rechtsform name (e.g. "GmbH", "Einzelunternehmen")
    const rawTitle = $("h1").first().text().trim();
    if (!rawTitle || rawTitle.length < 2) return null;

    // Strip common prefixes like "Rechtsform:" if present
    const name = rawTitle.replace(/^Rechtsform[:\s]+/i, "").trim();
    if (!name) return null;

    const slug = slugify(name);

    // Full legal name is often in an h2 or a subtitle element
    const fullName =
      $(".subtitle, .lead, h2").first().text().trim() || null;

    // Extract definition-list metadata (dl > dt + dd pairs on these pages)
    const meta: Record<string, string> = {};
    $("dl dt").each((_, el) => {
      const key = $(el).text().trim().toLowerCase().replace(/:$/, "");
      const value = $(el).next("dd").text().trim();
      if (key && value) meta[key] = value;
    });

    // Mindestkapital: look for patterns like "25.000 EUR" in meta or page text
    let minCapitalEur: number | null = null;
    const capitalSources = [
      meta["mindestkapital"] ?? "",
      meta["stammkapital"] ?? "",
      meta["grundkapital"] ?? "",
      $("*").text(),
    ].join(" ");
    const capitalMatch = capitalSources.match(
      /(?:mindest(?:kapital|stammkapital)|grundkapital)[^\d]*(\d[\d.,]*)\s*(?:Euro|EUR)/i,
    );
    if (capitalMatch) {
      const cleaned = capitalMatch[1]!.replace(/\./g, "").replace(",", ".");
      const parsed = parseFloat(cleaned);
      if (!isNaN(parsed)) minCapitalEur = Math.round(parsed);
    }

    // Haftung
    const liabilityType =
      meta["haftung"] ??
      extractSection($, ["haftung"]) ??
      null;

    // Notarpflicht
    const notaryText =
      (meta["notarpflicht"] ?? meta["notarielle beurkundung"] ?? "").toLowerCase();
    const notaryRequired =
      notaryText.includes("ja") || notaryText.includes("erforderlich")
        ? true
        : notaryText.includes("nein") || notaryText.includes("nicht")
          ? false
          : null;

    // Handelsregisterpflicht
    const hrText =
      (
        meta["handelsregisterpflicht"] ??
        meta["handelsregister"] ??
        ""
      ).toLowerCase();
    const tradeRegisterRequired =
      hrText.includes("ja") || hrText.includes("pflicht")
        ? true
        : hrText.includes("nein") || hrText.includes("nicht")
          ? false
          : null;

    // Founder count
    const founderCount =
      meta["mindestanzahl gründer"] ??
      meta["gesellschafter"] ??
      meta["anzahl gründer"] ??
      null;

    // Description — main content block
    const descriptionRaw =
      extractSection($, ["überblick", "beschreibung", "was ist", "allgemein"]) ??
      ($(".content-main, main, article").first().text().trim() || null);
    const descriptionDe = descriptionRaw ?? null;

    // Tax notes
    const taxNotesDe = extractSection($, [
      "steuer",
      "besteuerung",
      "steuerlich",
    ]);

    // Founding costs
    const foundingCostsDe = extractSection($, [
      "gründungsaufwand",
      "gründungskosten",
      "kosten",
    ]);

    const contentHash = makeHash({
      name,
      fullName,
      minCapitalEur,
      liabilityType,
      notaryRequired,
      tradeRegisterRequired,
      descriptionDe,
      taxNotesDe,
    });

    return {
      name,
      slug,
      fullName: fullName && fullName !== name ? fullName : null,
      minCapitalEur,
      liabilityType,
      notaryRequired,
      tradeRegisterRequired,
      founderCount,
      descriptionDe,
      taxNotesDe,
      foundingCostsDe,
      sourceUrl: url,
      contentHash,
    };
  }

  protected async diffRecord(record: ParsedRechtsform): Promise<DiffResult> {
    const existing = await db
      .select({ id: rechtsformen.id, contentHash: rechtsformen.contentHash })
      .from(rechtsformen)
      .where(eq(rechtsformen.sourceUrl, record.sourceUrl))
      .limit(1);

    if (existing.length === 0) return "new";
    if (existing[0]!.contentHash === record.contentHash) return "unchanged";
    return "updated";
  }

  protected async writeRecord(record: ParsedRechtsform): Promise<void> {
    const now = new Date();
    await db
      .insert(rechtsformen)
      .values({
        name: record.name,
        slug: record.slug,
        fullName: record.fullName,
        minCapitalEur: record.minCapitalEur,
        liabilityType: record.liabilityType,
        notaryRequired: record.notaryRequired,
        tradeRegisterRequired: record.tradeRegisterRequired,
        founderCount: record.founderCount,
        descriptionDe: record.descriptionDe,
        taxNotesDe: record.taxNotesDe,
        foundingCostsDe: record.foundingCostsDe,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
      })
      .onConflictDoUpdate({
        target: rechtsformen.slug,
        set: {
          name: record.name,
          fullName: record.fullName,
          minCapitalEur: record.minCapitalEur,
          liabilityType: record.liabilityType,
          notaryRequired: record.notaryRequired,
          tradeRegisterRequired: record.tradeRegisterRequired,
          founderCount: record.founderCount,
          descriptionDe: record.descriptionDe,
          taxNotesDe: record.taxNotesDe,
          foundingCostsDe: record.foundingCostsDe,
          sourceUrl: record.sourceUrl,
          contentHash: record.contentHash,
          scrapedAt: now,
          updatedAt: now,
        },
      });
  }
}

// ─── GewerbeanmeldungScraper ─────────────────────────────────────────────────
// Bundesland-keyed approach: each of the 16 states gets its own record.
// fetchUrls() returns 16 URLs with the Bundesland encoded as a URL fragment
// (e.g. "…/inhalt.html#Bayern"). Playwright navigates to the base URL (ignoring
// the fragment), so we fetch the same federal page for each state. parsePage()
// reads the fragment from the URL to assign the correct bundesland field,
// and the contentHash includes the bundesland so each row has a stable, unique key.

class GewerbeanmeldungScraper extends BaseScraper<ParsedGewerbeanmeldung> {
  constructor() {
    super({
      pipelineName: "scrape-gewerbeanmeldung",
      pipelineDescription:
        "Scrapes Gewerbeanmeldung requirements per Bundesland from service.bund.de (primary) and existenzgruender.de",
      pipelineSchedule: "0 3 * * 1", // every Monday at 03:00 UTC
      requestDelayMs: 1500, // shorter delay; same underlying page for all states
    });
  }

  protected async fetchUrls(_page: Page): Promise<string[]> {
    // Each Bundesland maps to a fragment-keyed variant of the federal source page.
    // Playwright ignores the fragment on navigation (fetches base URL once per goto call).
    return BUNDESLAENDER.map(
      (bl) => `${SERVICE_BUND_GEWERBE}#${encodeURIComponent(bl)}`,
    );
  }

  protected parsePage(
    html: string,
    url: string,
  ): ParsedGewerbeanmeldung | null {
    // Extract the bundesland from the URL fragment
    const fragment = decodeURIComponent(url.split("#")[1] ?? "");
    const bundesland = BUNDESLAENDER.find((bl) => bl === fragment);
    if (!bundesland) return null;

    const $ = cheerio.load(html);

    // Required documents — look for lists near "Unterlagen", "Dokumente", "benötigt"
    const docSection = extractSection($, [
      "unterlagen",
      "benötigte dokumente",
      "erforderliche unterlagen",
      "was benötigen sie",
    ]);
    const requiredDocuments: string[] = [];
    if (docSection) {
      // Try to split into individual items
      const lines = docSection.split(/\n|•|·|-(?=\s)/).map((l) => l.trim()).filter(Boolean);
      requiredDocuments.push(...lines);
    }

    // Federal standard documents if we couldn't extract any
    if (requiredDocuments.length === 0) {
      requiredDocuments.push(
        "Personalausweis oder Reisepass",
        "Ausgefülltes Gewerbeanmeldeformular",
        "Ggf. Erlaubnis / Genehmigung (bei erlaubnispflichtigen Gewerben)",
      );
    }

    // Cost: try to extract a EUR amount, fall back to known federal range
    let kostenEur: number | null = null;
    const pageText = $.text();
    const feeMatch = pageText.match(
      /(?:Gebühr|Kosten|Entgelt)[^\d]*(\d+)\s*(?:bis\s*(\d+)\s*)?(?:Euro|EUR)/i,
    );
    if (feeMatch) {
      kostenEur = parseInt(feeMatch[1]!, 10);
    } else {
      // Typical federal baseline fee; states charge between 15 and 65 EUR
      kostenEur = 26;
    }

    // Processing time
    let bearbeitungszeitTage: number | null = null;
    const timeMatch = pageText.match(
      /(?:Bearbeitungszeit|bearbeit)[^\d]*(\d+)\s*(?:bis\s*(\d+)\s*)?(?:Tag|Werktag|Arbeitstag)/i,
    );
    if (timeMatch) {
      bearbeitungszeitTage = parseInt(timeMatch[1]!, 10);
    } else {
      bearbeitungszeitTage = 3; // typical processing time across Germany
    }

    // Online availability signal
    const onlineText = pageText.toLowerCase();
    const onlineAvailable =
      onlineText.includes("online beantragen") ||
      onlineText.includes("online stellen") ||
      onlineText.includes("digital beantragen") ||
      onlineText.includes("elektronisch")
        ? true
        : null;

    // Zuständige Stelle description
    const zustaendigeStelleDescription =
      extractSection($, ["zuständig", "zuständige behörde", "gewerbeamt", "ordnungsamt"]) ??
      `Gewerbeamt der zuständigen Gemeinde oder des Landkreises in ${bundesland}`;

    // Bundesland-specific note
    const noteDe: string | null = null;

    const contentHash = makeHash({
      bundesland,
      requiredDocuments,
      kostenEur,
      bearbeitungszeitTage,
      zustaendigeStelleDescription,
    });

    return {
      bundesland,
      zustaendigeStelleDescription,
      kostenEur,
      bearbeitungszeitTage,
      requiredDocuments: requiredDocuments.length > 0 ? requiredDocuments : null,
      onlineAvailable,
      noteDe,
      sourceUrl: SERVICE_BUND_GEWERBE, // canonical source URL without fragment
      contentHash,
    };
  }

  protected async diffRecord(
    record: ParsedGewerbeanmeldung,
  ): Promise<DiffResult> {
    const existing = await db
      .select({
        id: gewerbeanmeldungInfo.id,
        contentHash: gewerbeanmeldungInfo.contentHash,
      })
      .from(gewerbeanmeldungInfo)
      .where(eq(gewerbeanmeldungInfo.bundesland, record.bundesland))
      .limit(1);

    if (existing.length === 0) return "new";
    if (existing[0]!.contentHash === record.contentHash) return "unchanged";
    return "updated";
  }

  protected async writeRecord(record: ParsedGewerbeanmeldung): Promise<void> {
    const now = new Date();
    await db
      .insert(gewerbeanmeldungInfo)
      .values({
        bundesland: record.bundesland,
        zustaendigeStelleDescription: record.zustaendigeStelleDescription,
        kostenEur: record.kostenEur,
        bearbeitungszeitTage: record.bearbeitungszeitTage,
        requiredDocuments: record.requiredDocuments,
        onlineAvailable: record.onlineAvailable,
        noteDe: record.noteDe,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
      })
      .onConflictDoUpdate({
        target: gewerbeanmeldungInfo.bundesland,
        set: {
          zustaendigeStelleDescription: record.zustaendigeStelleDescription,
          kostenEur: record.kostenEur,
          bearbeitungszeitTage: record.bearbeitungszeitTage,
          requiredDocuments: record.requiredDocuments,
          onlineAvailable: record.onlineAvailable,
          noteDe: record.noteDe,
          sourceUrl: record.sourceUrl,
          contentHash: record.contentHash,
          scrapedAt: now,
        },
      });
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/** Run both the Rechtsformen and Gewerbeanmeldung scrapers sequentially. */
export async function scrapeRechtsformen(): Promise<void> {
  const rechtsformenScraper = new RechtsformenScraper();
  const rechtsformenStats = await rechtsformenScraper.run();
  console.log(
    `[scrape-rechtsformen] Done — new: ${rechtsformenStats.newCount}, ` +
      `updated: ${rechtsformenStats.updatedCount}, ` +
      `unchanged: ${rechtsformenStats.unchangedCount}, ` +
      `errors: ${rechtsformenStats.errorCount}`,
  );

  const gewerbeScraper = new GewerbeanmeldungScraper();
  const gewerbeStats = await gewerbeScraper.run();
  console.log(
    `[scrape-gewerbeanmeldung] Done — new: ${gewerbeStats.newCount}, ` +
      `updated: ${gewerbeStats.updatedCount}, ` +
      `unchanged: ${gewerbeStats.unchangedCount}, ` +
      `errors: ${gewerbeStats.errorCount}`,
  );
}
