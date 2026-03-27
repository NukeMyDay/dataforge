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

// Per-state official service portal data for Gewerbeanmeldung.
// Each entry provides the authoritative state portal URL plus curated baseline
// data used as fallback when the portal page cannot be parsed (e.g. JavaScript
// rendering issues, page restructuring).
//
// baseKostenEur: representative fee in EUR. The actual fee is set by each
//   municipality (Gemeinde), so the state-level value is an approximation of
//   the most common fee in that state. Sources: official Gebührenordnungen and
//   municipal fee schedules where publicly available.
// onlineAvailable: whether the state offers an online submission path via its
//   official service portal. Curated from portal feature flags and OZG status.
interface BundeslandPortal {
  bundesland: string;
  url: string;
  onlineAvailable: boolean | null;
  baseKostenEur: number;
  additionalDocuments: string[];  // State-specific additions beyond common core
  zustaendigeStelleHint: string;
}

// Common core documents required in all Bundesländer.
const CORE_DOCUMENTS = [
  "Personalausweis oder Reisepass",
  "Ausgefülltes Gewerbeanmeldeformular",
  "Ggf. Erlaubnis / Genehmigung (bei erlaubnispflichtigen Gewerben)",
];

const BUNDESLAND_PORTALS: BundeslandPortal[] = [
  {
    bundesland: "Baden-Württemberg",
    url: "https://www.service-bw.de/zufi/leistungen/6000090",
    onlineAvailable: true,   // service-bw.de offers online submission via BundID
    baseKostenEur: 26,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zuständigen Gemeinde oder des Landkreises in Baden-Württemberg",
  },
  {
    bundesland: "Bayern",
    url: "https://www.freistaat.bayern/dokumente/Behoerde/6060149",
    onlineAvailable: false,  // most Bavarian municipalities still require in-person or postal
    baseKostenEur: 26,
    additionalDocuments: ["Bei Kapitalgesellschaften: Handelsregisterauszug (max. 3 Monate alt)"],
    zustaendigeStelleHint: "Gewerbeamt der zuständigen Gemeinde oder des Landkreises in Bayern",
  },
  {
    bundesland: "Berlin",
    url: "https://service.berlin.de/dienstleistung/305249/",
    onlineAvailable: true,   // service.berlin.de supports online registration
    baseKostenEur: 26,       // fixed city-state rate per Berliner Gebührenordnung
    additionalDocuments: ["Aktuelle Meldebescheinigung (max. 3 Monate alt)"],
    zustaendigeStelleHint: "Bezirkliches Ordnungsamt (Gewerbeangelegenheiten) des zuständigen Bezirks in Berlin",
  },
  {
    bundesland: "Brandenburg",
    url: "https://service.brandenburg.de/lis/detail.do?gsid=bb1.c.548660.de",
    onlineAvailable: false,
    baseKostenEur: 20,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zuständigen Stadt oder des Landkreises in Brandenburg",
  },
  {
    bundesland: "Bremen",
    url: "https://www.service.bremen.de/gewerbeanmeldung",
    onlineAvailable: true,   // Bremen integrates BundID for online Gewerbeanmeldung
    baseKostenEur: 26,
    additionalDocuments: [],
    zustaendigeStelleHint: "Ordnungsamt Bremen oder Bremerhaven",
  },
  {
    bundesland: "Hamburg",
    url: "https://www.hamburg.de/gewerbeanmeldung/",
    onlineAvailable: true,   // Hamburg offers online registration via hamburgservice.de
    baseKostenEur: 35,       // Hamburg Ordnungsamt rates are typically 30–56 EUR
    additionalDocuments: ["Aktuelle Meldebescheinigung"],
    zustaendigeStelleHint: "Bezirksamt (Gewerbeabteilung) des zuständigen Bezirks in Hamburg",
  },
  {
    bundesland: "Hessen",
    url: "https://wirtschaft.hessen.de/wirtschaft-und-recht/gruendung/gewerbeanmeldung",
    onlineAvailable: false,
    baseKostenEur: 26,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zuständigen Gemeinde oder des Landkreises in Hessen",
  },
  {
    bundesland: "Mecklenburg-Vorpommern",
    url: "https://www.service.mvnet.de/_php/download.php?datei_id=1597",
    onlineAvailable: false,
    baseKostenEur: 20,
    additionalDocuments: [],
    zustaendigeStelleHint: "Ordnungsamt der zuständigen Gemeinde oder des Landkreises in Mecklenburg-Vorpommern",
  },
  {
    bundesland: "Niedersachsen",
    url: "https://www.niedersachsen.de/wirtschaft/existenzgruendung/gewerbeanmeldung",
    onlineAvailable: false,
    baseKostenEur: 20,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zuständigen Gemeinde oder des Landkreises in Niedersachsen",
  },
  {
    bundesland: "Nordrhein-Westfalen",
    url: "https://www.nrw.de/leben-in-nrw/arbeit-wirtschaft/existenzgruendung/gewerbeanmeldung",
    onlineAvailable: true,   // NRW OZG portal supports online submission in many municipalities
    baseKostenEur: 26,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zuständigen Gemeinde oder des Kreises in Nordrhein-Westfalen",
  },
  {
    bundesland: "Rheinland-Pfalz",
    url: "https://www.rlp.de/wirtschaft/wirtschaft-und-finanzen/unternehmensgruendung/gewerbeanmeldung",
    onlineAvailable: false,
    baseKostenEur: 20,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zuständigen Gemeinde oder des Landkreises in Rheinland-Pfalz",
  },
  {
    bundesland: "Saarland",
    url: "https://www.saarland.de/DE/portale/wirtschaft/service/beantragungen_genehmigungen/gewerbeanmeldung/gewerbeanmeldung_node.html",
    onlineAvailable: false,
    baseKostenEur: 25,
    additionalDocuments: [],
    zustaendigeStelleHint: "Ordnungsamt der zuständigen Gemeinde im Saarland",
  },
  {
    bundesland: "Sachsen",
    url: "https://amt24.sachsen.de/leistung/detail/leistung/gewerbeanmeldung-gewerbeanzeige",
    onlineAvailable: false,
    baseKostenEur: 20,       // Sächsisches Kostenverzeichnis sets baseline at 20 EUR
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zuständigen Gemeinde oder des Landkreises in Sachsen",
  },
  {
    bundesland: "Sachsen-Anhalt",
    url: "https://www.investieren-in-sachsen-anhalt.de/gruenden-in-sachsen-anhalt/gewerbeanmeldung",
    onlineAvailable: false,
    baseKostenEur: 20,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zuständigen Gemeinde oder des Landkreises in Sachsen-Anhalt",
  },
  {
    bundesland: "Schleswig-Holstein",
    url: "https://www.schleswig-holstein.de/DE/Landesregierung/Themen/Wirtschaft/Wirtschaft_Unternehmen/Gewerbeanmeldung/gewerbeanmeldung_node.html",
    onlineAvailable: false,
    baseKostenEur: 20,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zuständigen Gemeinde oder des Kreises in Schleswig-Holstein",
  },
  {
    bundesland: "Thüringen",
    url: "https://www.thueringen.de/wirtschaft/gruendung/gewerbeanmeldung/",
    onlineAvailable: false,
    baseKostenEur: 20,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zuständigen Gemeinde oder des Landkreises in Thüringen",
  },
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
// Fetches each Bundesland's own official service portal page independently.
// fetchUrls() returns 16 distinct state portal URLs (one per Bundesland).
// parsePage() maps the fetched URL back to its Bundesland entry, tries to
// extract real fee/document data from the page HTML, and falls back to the
// curated baseline values in BUNDESLAND_PORTALS when parsing yields nothing.
// This ensures sourceUrl, kostenEur, and onlineAvailable are all state-specific.

class GewerbeanmeldungScraper extends BaseScraper<ParsedGewerbeanmeldung> {
  constructor() {
    super({
      pipelineName: "scrape-gewerbeanmeldung",
      pipelineDescription:
        "Scrapes Gewerbeanmeldung requirements per Bundesland from official state service portals",
      pipelineSchedule: "0 3 * * 1", // every Monday at 03:00 UTC
      requestDelayMs: 2000,
    });
  }

  protected async fetchUrls(_page: Page): Promise<string[]> {
    // Each Bundesland has its own state-specific portal URL — no fragment tricks.
    return BUNDESLAND_PORTALS.map((p) => p.url);
  }

  protected parsePage(
    html: string,
    url: string,
  ): ParsedGewerbeanmeldung | null {
    // Map the fetched URL back to its Bundesland portal entry.
    // Strip fragment (#) from url before matching, since Playwright may add one.
    const urlBase = url.split("#")[0]!;
    const portal = BUNDESLAND_PORTALS.find((p) => p.url.split("#")[0] === urlBase);
    if (!portal) return null;

    const { bundesland } = portal;
    const $ = cheerio.load(html);
    const pageText = $.text();

    // ── Fee extraction ────────────────────────────────────────────────────────
    // Try to find an explicit EUR amount near fee-related keywords.
    // Pattern covers "Gebühr: 26 Euro", "Kosten ab 20 EUR", "Entgelt 30–65 EUR".
    let kostenEur: number | null = null;
    const feeMatch = pageText.match(
      /(?:Gebühr|Kosten|Entgelt|Verwaltungsgebühr)[^\d]{0,30}(\d{1,3})\s*(?:bis\s*\d+\s*)?(?:Euro|EUR)/i,
    );
    if (feeMatch) {
      const parsed = parseInt(feeMatch[1]!, 10);
      if (parsed >= 5 && parsed <= 300) {
        // Sanity range: ignore implausibly small or large extracted numbers
        kostenEur = parsed;
      }
    }
    // Fall back to curated state-specific baseline
    if (kostenEur === null) kostenEur = portal.baseKostenEur;

    // ── Processing time ───────────────────────────────────────────────────────
    let bearbeitungszeitTage: number | null = null;
    const timeMatch = pageText.match(
      /(?:Bearbeitungszeit|bearbeit)[^\d]{0,20}(\d+)\s*(?:bis\s*\d+\s*)?(?:Tag|Werktag|Arbeitstag)/i,
    );
    if (timeMatch) {
      bearbeitungszeitTage = parseInt(timeMatch[1]!, 10);
    } else {
      bearbeitungszeitTage = 3; // standard same-day to 3-day processing across Germany
    }

    // ── Online availability ───────────────────────────────────────────────────
    // Page signal overrides the curated default when present.
    const onlineLower = pageText.toLowerCase();
    const pageSignalsOnline =
      onlineLower.includes("online beantragen") ||
      onlineLower.includes("online stellen") ||
      onlineLower.includes("digital beantragen") ||
      onlineLower.includes("elektronisch einreichen") ||
      onlineLower.includes("bundid");
    const onlineAvailable = pageSignalsOnline ? true : portal.onlineAvailable;

    // ── Required documents ────────────────────────────────────────────────────
    // Try to extract a document list from the page.
    const docSection = extractSection($, [
      "unterlagen",
      "benötigte dokumente",
      "erforderliche unterlagen",
      "was benötigen sie",
      "mitbringen",
    ]);
    let requiredDocuments: string[];
    if (docSection) {
      const lines = docSection
        .split(/\n|•|·|-(?=\s)/)
        .map((l) => l.trim())
        .filter((l) => l.length > 5 && l.length < 200); // exclude junk fragments
      if (lines.length > 0) {
        requiredDocuments = lines;
      } else {
        requiredDocuments = [...CORE_DOCUMENTS, ...portal.additionalDocuments];
      }
    } else {
      // Curated list: common core + state-specific additions
      requiredDocuments = [...CORE_DOCUMENTS, ...portal.additionalDocuments];
    }

    // ── Zuständige Stelle ─────────────────────────────────────────────────────
    const zustaendigeStelleDescription =
      extractSection($, ["zuständig", "zuständige behörde", "gewerbeamt", "ordnungsamt"]) ??
      portal.zustaendigeStelleHint;

    const contentHash = makeHash({
      bundesland,
      requiredDocuments,
      kostenEur,
      bearbeitungszeitTage,
      onlineAvailable,
      zustaendigeStelleDescription,
    });

    return {
      bundesland,
      zustaendigeStelleDescription,
      kostenEur,
      bearbeitungszeitTage,
      requiredDocuments,
      onlineAvailable,
      noteDe: null,
      sourceUrl: portal.url, // actual state-specific portal URL
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
