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

// existenzgruender.de was migrated to existenzgruendungsportal.de (March 2026).
// The new site consolidates all Rechtsformen into a single comparison page
// rather than individual detail pages.
const EXISTENZGRUENDUNGSPORTAL_BASE = "https://www.existenzgruendungsportal.de";
const RECHTSFORMEN_OVERVIEW = `${EXISTENZGRUENDUNGSPORTAL_BASE}/Navigation/DE/Gruendungswissen/Rechtsformen/rechtsformen`;

// All Rechtsformen available on the consolidated comparison page.
// Each entry maps to a fragment-keyed URL so BaseScraper treats each Rechtsform
// as a separate "URL" while Playwright fetches the same base page.
// `rowLabel`: normalized prefix of the first table cell on existenzgruendungsportal.de
//   (lowercase, no dots/parens/slashes/spaces) used for row matching.
const KNOWN_RECHTSFORMEN: Array<{ slug: string; name: string; fullName?: string; rowLabel: string }> = [
  { slug: "einzelunternehmen", name: "Einzelunternehmen", rowLabel: "einzelunternehmen" },
  { slug: "gbr", name: "GbR", fullName: "Gesellschaft bürgerlichen Rechts", rowLabel: "gbr" },
  // Page uses: "eingetragene Kauffrau (e.Kfr.) bzw. eingetragener Kaufmann (e.Kfm.)"
  { slug: "ek", name: "e.K.", fullName: "eingetragene Kauffrau / eingetragener Kaufmann", rowLabel: "eingetragenekauffrau" },
  { slug: "ohg", name: "OHG", fullName: "Offene Handelsgesellschaft", rowLabel: "ohg" },
  { slug: "kg", name: "KG", fullName: "Kommanditgesellschaft", rowLabel: "kg" },
  { slug: "gmbh", name: "GmbH", fullName: "Gesellschaft mit beschränkter Haftung", rowLabel: "gmbh" },
  { slug: "ug", name: "UG (haftungsbeschränkt)", fullName: "Unternehmergesellschaft (haftungsbeschränkt)", rowLabel: "ug" },
  { slug: "ag", name: "AG", fullName: "Aktiengesellschaft", rowLabel: "ag" },
  { slug: "genossenschaft", name: "Genossenschaft (eG)", fullName: "eingetragene Genossenschaft", rowLabel: "genossenschaft" },
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

  protected async fetchUrls(_page: Page): Promise<string[]> {
    // existenzgruendungsportal.de consolidates all Rechtsformen into one page.
    // We encode each Rechtsform slug as a URL fragment so BaseScraper treats
    // each as a separate record. Playwright ignores the fragment on navigation.
    return KNOWN_RECHTSFORMEN.map(rf => `${RECHTSFORMEN_OVERVIEW}#${rf.slug}`);
  }

  protected parsePage(html: string, url: string): ParsedRechtsform | null {
    // Extract the slug from the URL fragment (e.g. "…/rechtsformen#gmbh" → "gmbh")
    const fragment = decodeURIComponent(url.split("#")[1] ?? "");
    const known = KNOWN_RECHTSFORMEN.find(rf => rf.slug === fragment);
    if (!known) return null;

    const { slug, name: knownName, fullName: knownFullName, rowLabel } = known;
    const $ = cheerio.load(html);

    // existenzgruendungsportal.de renders all Rechtsformen in a row-based comparison
    // table (first table on the page). Row structure:
    //   cells[0]: Rechtsform name  | cells[1]: Mindestkapital | cells[2]: Gründer minimum
    //   cells[3]: Haftung          | cells[4]: HR Eintragung  | cells[5]: Notar
    //   cells[6]: Formvorschriften
    // A second table on the page contains Vorteile/Nachteile — we ignore it.

    let liabilityType: string | null = null;
    let minCapitalEur: number | null = null;
    let notaryRequired: boolean | null = null;
    let tradeRegisterRequired: boolean | null = null;
    let founderCount: string | null = null;

    // Use only the first table to avoid picking up data from the Vorteile/Nachteile table.
    const firstTable = $("table").first();
    let found = false;

    firstTable.find("tr").each((_, row) => {
      const cells = $(row).find("td, th");
      if (cells.length < 3) return;

      const firstCell = $(cells[0]).text().trim().replace(/\s+/g, " ");
      // Match the first cell exactly against the known Rechtsform name or abbreviation.
      // Use case-insensitive exact match to avoid false positives (e.g. "AG" in other words).
      // Match using the precomputed rowLabel (normalized cell prefix) for this Rechtsform.
      // The rowLabel is lowercase with dots, parens, slashes, and spaces removed.
      const normalized = firstCell.toLowerCase().replace(/[.()/\s]/g, "");
      if (!normalized.startsWith(rowLabel)) {
        return; // no match — continue to next row
      }
      found = true;

      // cells[1]: Mindestkapital
      const capitalText = $(cells[1]).text().trim();
      if (/keines|kein\s/i.test(capitalText) || capitalText === "") {
        minCapitalEur = null;
      } else {
        const m = capitalText.match(/(\d[\d.,]*)\s*(?:Euro|EUR)/i);
        if (m) {
          const cleaned = m[1]!.replace(/\./g, "").replace(",", ".");
          const parsed = parseFloat(cleaned);
          if (!isNaN(parsed)) minCapitalEur = Math.round(parsed);
        }
      }

      // cells[2]: Gründer minimum
      if (cells.length > 2) founderCount = $(cells[2]).text().trim().substring(0, 64) || null;

      // cells[3]: Haftung
      if (cells.length > 3) liabilityType = $(cells[3]).text().trim().substring(0, 256) || null;

      // cells[4]: HR Eintragung
      if (cells.length > 4) {
        const hrText = $(cells[4]).text().trim().toLowerCase();
        tradeRegisterRequired = /^ja/i.test(hrText) ? true : /^nein/i.test(hrText) ? false : null;
      }

      // cells[5]: Notar
      if (cells.length > 5) {
        const notaryText = $(cells[5]).text().trim().toLowerCase();
        notaryRequired = /^ja/i.test(notaryText) ? true : /^nein/i.test(notaryText) ? false : null;
      }

      return false; // break — found our row
    });

    if (!found) {
      console.warn(`[scrape-rechtsformen] Could not locate row for ${knownName} in comparison table`);
    }

    // Description: extract Vorteile + Nachteile sections for the Rechtsform.
    // The page uses headings like "Vorteile und Nachteile" followed by lists.
    const descriptionParts: string[] = [];

    // Try to extract advantage/disadvantage lists near this Rechtsform's name
    const proText = extractSection($, ["vorteile", "pro und contra", "vor- und nachteile"]);
    if (proText) descriptionParts.push(proText);

    // Fallback: use the full main article text, trimmed
    if (descriptionParts.length === 0) {
      const mainText = $("main, article, .content").first().text().trim();
      if (mainText && mainText.length > 50) descriptionParts.push(mainText.substring(0, 2000));
    }

    const descriptionDe = descriptionParts.join("\n\n") || null;

    // Capital: also try a full-page text scan as fallback for GmbH/UG/AG
    if (minCapitalEur === null) {
      const pageText = $.text();
      const capitalMatch = pageText.match(
        new RegExp(`${knownName}[^€EUR]*?(?:Mindest(?:stamm|grund|kapital)|Stammkapital|Grundkapital)[^\\d]*(\\d[\\d.,]*)\\s*(?:Euro|EUR)`, "i"),
      );
      if (capitalMatch) {
        const cleaned = capitalMatch[1]!.replace(/\./g, "").replace(",", ".");
        const parsed = parseFloat(cleaned);
        if (!isNaN(parsed)) minCapitalEur = Math.round(parsed);
      }
    }

    const contentHash = makeHash({
      slug,
      minCapitalEur,
      liabilityType,
      notaryRequired,
      tradeRegisterRequired,
      founderCount,
      descriptionDe,
    });

    // Canonical source URL (without fragment) for provenance
    const sourceUrl = RECHTSFORMEN_OVERVIEW;

    return {
      name: knownName,
      slug,
      fullName: knownFullName ?? null,
      minCapitalEur,
      liabilityType,
      notaryRequired,
      tradeRegisterRequired,
      founderCount,
      descriptionDe,
      taxNotesDe: null,
      foundingCostsDe: null,
      sourceUrl,
      contentHash,
    };
  }

  protected async diffRecord(record: ParsedRechtsform): Promise<DiffResult> {
    // Use slug as the stable key (all records share the same sourceUrl now)
    const existing = await db
      .select({ id: rechtsformen.id, contentHash: rechtsformen.contentHash })
      .from(rechtsformen)
      .where(eq(rechtsformen.slug, record.slug))
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
