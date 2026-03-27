// Silo 4 scraper: Sozialversicherung & Arbeitsrecht
//
// Scrapes current German social insurance contribution rates (Beitragssätze) and
// employer obligations (Meldepflichten, Arbeitgeberpflichten) from official primary sources.
//
// Primary sources per data type:
//
//   Contribution rates (Beitragssätze):
//   - deutsche-rentenversicherung.de  — authoritative for Rentenversicherung (§ 158 SGB VI)
//   - gkv-spitzenverband.de           — statutory health insurance (§ 241 SGB V)
//   - arbeitsagentur.de               — Arbeitslosenversicherung (§ 341 SGB III)
//   - minijob-zentrale.de             — Minijob Pauschalbeiträge (Deutsche Rentenversicherung KBS)
//   - bundesgesundheitsministerium.de — Pflegeversicherung (§ 55 SGB XI)
//
//   Employer obligations (Pflichten):
//   - bmas.bund.de      — Bundesministerium für Arbeit und Soziales, primary authority
//                         for Arbeitsrecht and employer obligations
//   - arbeitsagentur.de — Meldepflichten (§ 28a SGB IV)
//   - minijob-zentrale.de — Minijob-specific registration rules and Gleitzone

import * as cheerio from "cheerio";
import { createHash } from "crypto";
import { db, svContributionRates, svObligations } from "@dataforge/db";
import { eq } from "drizzle-orm";
import { BaseScraper, type DiffResult } from "../lib/base-scraper.js";
import type { Page } from "playwright";

// ─── Source URLs ──────────────────────────────────────────────────────────────

// deutsche-rentenversicherung.de — primary source for Rentenversicherung Beitragssatz.
// Published annually under "Beiträge" / "Beitragssätze und Rechengrößen".
const DRV_BEITRAEGE_URL =
  "https://www.deutsche-rentenversicherung.de/DRV/DE/Experten/Zahlen-und-Fakten/Werte-der-Rentenversicherung/werte-der-rentenversicherung_node.html";

// gkv-spitzenverband.de — Spitzenverband der gesetzlichen Krankenversicherung publishes
// the statutory general contribution rate (allgemeiner Beitragssatz) under § 241 SGB V.
const GKV_BEITRAEGE_URL =
  "https://www.gkv-spitzenverband.de/krankenversicherung/beitraege/beitragssaetze/beitragssaetze.jsp";

// arbeitsagentur.de — Federal Employment Agency, primary authority for
// Arbeitslosenversicherung Beitragssatz (§ 341 SGB III) and Meldepflichten.
const BA_BEITRAEGE_URL =
  "https://www.arbeitsagentur.de/datei/beitraege-zur-sozialversicherung_ba014364.pdf";

// minijob-zentrale.de — official portal for Minijob rules operated by Deutsche
// Rentenversicherung Knappschaft-Bahn-See. Covers 538€ threshold, Pauschalbeiträge, Gleitzone.
const MINIJOB_URL =
  "https://www.minijob-zentrale.de/DE/01_minijobs/02_gewerblich/02_was_zahlt_der_arbeitgeber/node.html";

// bundesgesundheitsministerium.de — primary authority for Pflegeversicherung rates (§ 55 SGB XI).
const BMG_PFLEGE_URL =
  "https://www.bundesgesundheitsministerium.de/themen/pflege/pflegeversicherung-zahlen-und-fakten.html";

// bmas.bund.de — Bundesministerium für Arbeit und Soziales, primary authority for
// employment law and employer obligations in Germany (Arbeitsrecht, Meldepflichten).
const BMAS_URL =
  "https://www.bmas.de/DE/Arbeit/Arbeitsrecht/arbeitsrecht.html";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeHash(data: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function extractSection(
  $: cheerio.CheerioAPI,
  headingTexts: string[],
): string | null {
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

// Try to extract a percentage rate from arbitrary page text near a keyword.
function extractRate(text: string, keyword: string): string | null {
  // Match patterns like "18,6 Prozent", "18.6%", "18,6 %"
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `${escaped}[^\\d]{0,80}?(\\d{1,2}[,.]\\d{1,2})\\s*(?:Prozent|%)`,
    "i",
  );
  const m = text.match(re);
  if (m) return m[1]!.replace(",", ".") + "%";
  return null;
}

// ─── Parsed types ─────────────────────────────────────────────────────────────

interface ParsedContributionRate {
  insuranceType: string;
  labelDe: string;
  rateTotal: string | null;
  rateEmployer: string | null;
  rateEmployee: string | null;
  notesDe: string | null;
  validFrom: string;
  sourceUrl: string;
  contentHash: string;
}

interface ParsedObligation {
  obligationType: string;
  labelDe: string;
  descriptionDe: string | null;
  descriptionEn: string | null;
  deadlineInfo: string | null;
  appliesTo: string;
  legalBasis: string | null;
  sourceUrl: string;
  contentHash: string;
}

// ─── Authoritative baseline data ─────────────────────────────────────────────
// These values are the official 2025 rates published by the respective authorities.
// Scrapers update them when the source pages change; this baseline ensures the DB
// is never empty even if a source temporarily becomes unavailable.

const BASELINE_RATES: Omit<ParsedContributionRate, "contentHash">[] = [
  {
    insuranceType: "krankenversicherung",
    labelDe: "Gesetzliche Krankenversicherung (GKV)",
    rateTotal: "14.6%",
    rateEmployer: "7.3%",
    rateEmployee: "7.3%",
    notesDe:
      "Allgemeiner Beitragssatz nach § 241 SGB V. Hinzu kommt ein einkommensabhängiger Zusatzbeitrag (2025 avg. ca. 1.7%), der hälftig geteilt wird. Gesamtbelastung ca. 16.3%.",
    validFrom: "2025-01-01",
    sourceUrl: GKV_BEITRAEGE_URL,
  },
  {
    insuranceType: "rentenversicherung",
    labelDe: "Gesetzliche Rentenversicherung (GRV)",
    rateTotal: "18.6%",
    rateEmployer: "9.3%",
    rateEmployee: "9.3%",
    notesDe:
      "Beitragssatz nach § 158 SGB VI. Gilt bis zur Beitragsbemessungsgrenze (West 2025: 8.050 €/Monat, Ost: 7.450 €/Monat).",
    validFrom: "2025-01-01",
    sourceUrl: DRV_BEITRAEGE_URL,
  },
  {
    insuranceType: "arbeitslosenversicherung",
    labelDe: "Arbeitslosenversicherung (ALV)",
    rateTotal: "2.6%",
    rateEmployer: "1.3%",
    rateEmployee: "1.3%",
    notesDe:
      "Beitragssatz nach § 341 SGB III. Gilt bis zur Beitragsbemessungsgrenze der Rentenversicherung.",
    validFrom: "2025-01-01",
    sourceUrl: BA_BEITRAEGE_URL,
  },
  {
    insuranceType: "pflegeversicherung",
    labelDe: "Soziale Pflegeversicherung (SPV)",
    rateTotal: "3.4%",
    rateEmployer: "1.7%",
    rateEmployee: "1.7%",
    notesDe:
      "Beitragssatz nach § 55 SGB XI. Kinderlose Arbeitnehmer zahlen einen Zuschlag von 0.6%. In Sachsen trägt der Arbeitgeber nur 1.2%, der Arbeitnehmer 2.2%.",
    validFrom: "2025-01-01",
    sourceUrl: BMG_PFLEGE_URL,
  },
  {
    insuranceType: "minijob_pauschalbeitrag_kv",
    labelDe: "Minijob – Pauschalbeitrag Krankenversicherung",
    rateTotal: "13%",
    rateEmployer: "13%",
    rateEmployee: "0%",
    notesDe:
      "Pauschalabgabe für geringfügig Beschäftigte bis 538 €/Monat (§ 249b SGB V). Nur vom Arbeitgeber getragen.",
    validFrom: "2025-01-01",
    sourceUrl: MINIJOB_URL,
  },
  {
    insuranceType: "minijob_pauschalbeitrag_rv",
    labelDe: "Minijob – Pauschalbeitrag Rentenversicherung",
    rateTotal: "15%",
    rateEmployer: "15%",
    rateEmployee: "0%",
    notesDe:
      "Pauschalabgabe für gewerbliche Minijobs bis 538 €/Monat (§ 172 SGB VI). Arbeitnehmer können auf Rentenversicherungspflicht verzichten (Befreiung möglich), zahlen sonst Aufstockungsbeitrag auf 18.6%.",
    validFrom: "2025-01-01",
    sourceUrl: MINIJOB_URL,
  },
];

const BASELINE_OBLIGATIONS: Omit<ParsedObligation, "contentHash">[] = [
  {
    obligationType: "anmeldung_neuer_mitarbeiter",
    labelDe: "Anmeldung neuer Mitarbeiter",
    descriptionDe:
      "Arbeitgeber müssen neu eingestellte Arbeitnehmer bei der zuständigen Krankenkasse zur Sozialversicherung anmelden. Die Anmeldung muss spätestens mit der ersten Lohn-/Gehaltsabrechnung, in jedem Fall aber innerhalb von 6 Wochen nach Beschäftigungsbeginn erfolgen.",
    descriptionEn:
      "Employers must register newly hired employees with their statutory health insurance fund (Krankenkasse) for social insurance purposes. Registration must be submitted with the first payroll run, at the latest within 6 weeks of the start of employment.",
    deadlineInfo: "Innerhalb von 6 Wochen nach Beschäftigungsbeginn (§ 28a SGB IV)",
    appliesTo: "Arbeitgeber",
    legalBasis: "§ 28a SGB IV",
    sourceUrl: "https://www.arbeitsagentur.de/unternehmen/personalfragen/meldepflichten",
  },
  {
    obligationType: "krankenkassenwahl",
    labelDe: "Krankenkassenwahl des Arbeitnehmers",
    descriptionDe:
      "Arbeitnehmer haben das Recht, ihre gesetzliche Krankenkasse frei zu wählen (§ 173 SGB V). Der Arbeitgeber meldet den Arbeitnehmer bei der vom Arbeitnehmer gewählten Krankenkasse an. Wählt der Arbeitnehmer keine Krankenkasse, kann der Arbeitgeber eine zuweisen. Die Krankenkasse ist gleichzeitig Einzugsstelle für alle Sozialversicherungsbeiträge.",
    descriptionEn:
      "Employees are free to choose their statutory health insurer (§ 173 SGB V). The employer registers the employee with the chosen Krankenkasse, which also collects all social insurance contributions.",
    deadlineInfo: null,
    appliesTo: "Arbeitgeber, Arbeitnehmer",
    legalBasis: "§ 173 SGB V",
    sourceUrl: BMAS_URL,
  },
  {
    obligationType: "sozialversicherungsausweis",
    labelDe: "Sozialversicherungsausweis / Versicherungsnummer",
    descriptionDe:
      "Jeder versicherungspflichtige Arbeitnehmer erhält eine lebenslange Sozialversicherungsnummer und einen Sozialversicherungsausweis. Arbeitgeber sind verpflichtet, die Versicherungsnummer bei Anmeldung anzugeben. Neue Mitarbeiter ohne Versicherungsnummer werden durch die Deutsche Rentenversicherung registriert.",
    descriptionEn:
      "Every employee subject to social insurance receives a lifelong social insurance number. Employers must provide this number when registering employees; new employees without a number are registered by Deutsche Rentenversicherung.",
    deadlineInfo: null,
    appliesTo: "Arbeitgeber",
    legalBasis: "§ 28a Abs. 3 SGB IV",
    sourceUrl: DRV_BEITRAEGE_URL,
  },
  {
    obligationType: "minijob_regelungen",
    labelDe: "Minijob-Regelungen (geringfügige Beschäftigung)",
    descriptionDe:
      "Minijobs sind Beschäftigungen bis 538 €/Monat (seit Oktober 2022). Arbeitgeber zahlen Pauschalabgaben von 13% KV + 15% RV + 2% Pauschalsteuer (insgesamt ca. 31%). Arbeitnehmer sind von Krankenversicherungsbeiträgen befreit, bleiben aber rentenversicherungspflichtig (können sich befreien lassen). Für Beschäftigungen zwischen 538,01 € und 2.000 € gilt die Gleitzonenregelung (Übergangsbereich).",
    descriptionEn:
      "Minijobs cover employment up to 538 €/month. Employers pay flat-rate contributions (13% KV + 15% RV + 2% payroll tax, totalling ~31%). Employees are exempt from health insurance contributions but remain subject to pension insurance (exemption possible). Earnings between 538.01 € and 2,000 € fall under the sliding-scale zone (Übergangsbereich).",
    deadlineInfo: null,
    appliesTo: "Arbeitgeber, Minijobber",
    legalBasis: "§ 8 SGB IV, § 249b SGB V, § 172 SGB VI",
    sourceUrl: MINIJOB_URL,
  },
  {
    obligationType: "lohnfortzahlung_krankheitsfall",
    labelDe: "Lohnfortzahlung im Krankheitsfall",
    descriptionDe:
      "Arbeitgeber sind verpflichtet, erkrankten Arbeitnehmern für bis zu 6 Wochen das volle Gehalt fortzuzahlen (Entgeltfortzahlungsgesetz, EFZG). Voraussetzung ist ein ununterbrochenes Arbeitsverhältnis von mindestens 4 Wochen. Ab der 7. Woche zahlt die Krankenkasse Krankengeld (70% des Bruttolohns, max. 90% des Nettolohns).",
    descriptionEn:
      "Employers must continue paying full salary to sick employees for up to 6 weeks (Entgeltfortzahlungsgesetz). The employee must have been employed for at least 4 uninterrupted weeks. From week 7 onward, the Krankenkasse pays Krankengeld (70% of gross salary, max. 90% of net).",
    deadlineInfo: "Ab 1. Krankheitstag, max. 6 Wochen je Erkrankung",
    appliesTo: "Arbeitgeber",
    legalBasis: "§ 3 EFZG (Entgeltfortzahlungsgesetz)",
    sourceUrl: BMAS_URL,
  },
  {
    obligationType: "urlaubsanspruch",
    labelDe: "Mindest-Urlaubsanspruch",
    descriptionDe:
      "Das Bundesurlaubsgesetz (BUrlG) garantiert jedem Arbeitnehmer mindestens 24 Werktage Urlaub pro Jahr bei einer 6-Tage-Woche (entspricht 20 Arbeitstagen bei 5-Tage-Woche). Günstigere tarifliche oder vertragliche Regelungen gehen vor. Der Urlaub ist grundsätzlich im laufenden Kalenderjahr zu gewähren und zu nehmen.",
    descriptionEn:
      "The Federal Leave Act (BUrlG) guarantees every employee at least 24 working days of annual leave on a 6-day week (equivalent to 20 working days on a 5-day week). More favourable collective or contractual arrangements take precedence.",
    deadlineInfo: "Im laufenden Kalenderjahr; Übertragung bis 31. März möglich",
    appliesTo: "Arbeitgeber",
    legalBasis: "§ 3 BUrlG (Bundesurlaubsgesetz)",
    sourceUrl: BMAS_URL,
  },
  {
    obligationType: "kuendigungsschutz_basics",
    labelDe: "Kündigungsschutz (Grundlagen)",
    descriptionDe:
      "Das Kündigungsschutzgesetz (KSchG) gilt für Betriebe mit mehr als 10 Arbeitnehmern und nach 6-monatiger Betriebszugehörigkeit. Kündigungen müssen sozial gerechtfertigt sein (personen-, verhaltens- oder betriebsbedingt). Für besondere Personengruppen (Schwangere, Schwerbehinderte, Betriebsräte) gelten Sonderkündigungsschutzregeln.",
    descriptionEn:
      "The Dismissal Protection Act (KSchG) applies to companies with more than 10 employees and after 6 months of employment. Dismissals must be socially justified (personal, behavioural, or operational reasons). Special protection applies to pregnant employees, severely disabled persons, and works council members.",
    deadlineInfo: "Gilt ab 6 Monaten Betriebszugehörigkeit",
    appliesTo: "Arbeitgeber",
    legalBasis: "§ 1 KSchG (Kündigungsschutzgesetz)",
    sourceUrl: BMAS_URL,
  },
  {
    obligationType: "selbststaendige_rv_pflicht",
    labelDe: "Rentenversicherungspflicht für Selbstständige",
    descriptionDe:
      "Bestimmte Berufsgruppen von Selbstständigen unterliegen der gesetzlichen Rentenversicherungspflicht (§ 2 SGB VI), z. B. Handwerker, Lehrer, Erzieher, Pflegepersonen, Künstler und Publizisten (KSK), sowie Selbstständige mit nur einem Auftraggeber. Der Beitragssatz beträgt 18,6% des beitragspflichtigen Einkommens.",
    descriptionEn:
      "Certain categories of self-employed persons are compulsorily insured in the statutory pension scheme (§ 2 SGB VI), including craftspeople, teachers, nurses, artists and journalists (KSK), and the self-employed with a single client. The contribution rate is 18.6% of pensionable income.",
    deadlineInfo: "Meldung innerhalb von 3 Monaten nach Aufnahme der Tätigkeit",
    appliesTo: "Selbstständige",
    legalBasis: "§ 2 SGB VI",
    sourceUrl: DRV_BEITRAEGE_URL,
  },
];

// ─── SvBeitraegeScraper ───────────────────────────────────────────────────────
// Scrapes current social insurance contribution rates from official sources.
//
// Strategy: encode each insurance type as a URL fragment so BaseScraper iterates
// over each entry as a separate "record". parsePage() tries to extract updated
// rates from the live source page and falls back to the baseline if extraction fails.

const RATE_SOURCE_URLS: Record<string, string> = {
  krankenversicherung: GKV_BEITRAEGE_URL,
  rentenversicherung: DRV_BEITRAEGE_URL,
  arbeitslosenversicherung: BA_BEITRAEGE_URL,
  pflegeversicherung: BMG_PFLEGE_URL,
  minijob_pauschalbeitrag_kv: MINIJOB_URL,
  minijob_pauschalbeitrag_rv: MINIJOB_URL,
};

class SvBeitraegeScraper extends BaseScraper<ParsedContributionRate> {
  constructor() {
    super({
      pipelineName: "scrape-sv-beitraege",
      pipelineDescription:
        "Scrapes current German social insurance contribution rates from official primary sources (DRV, GKV-Spitzenverband, BA, BMG, Minijob-Zentrale)",
      pipelineSchedule: "0 4 * * 1", // every Monday at 04:00 UTC
      requestDelayMs: 2000,
    });
  }

  protected async fetchUrls(_page: Page): Promise<string[]> {
    // One URL fragment per insurance type; Playwright fetches the real source page,
    // parsePage() decodes the fragment to know which insurance type to update.
    return Object.entries(RATE_SOURCE_URLS).map(
      ([type, url]) => `${url}#sv-type=${encodeURIComponent(type)}`,
    );
  }

  protected parsePage(
    html: string,
    url: string,
  ): ParsedContributionRate | null {
    // Decode the insurance type from the fragment
    const fragment = url.split("#sv-type=")[1];
    const insuranceType = fragment ? decodeURIComponent(fragment) : null;
    if (!insuranceType) return null;

    const baseline = BASELINE_RATES.find(
      (r) => r.insuranceType === insuranceType,
    );
    if (!baseline) return null;

    const $ = cheerio.load(html);
    const pageText = $.text();

    // Attempt to extract updated rates from the live page.
    // Fall back to baseline values if extraction fails (government pages change structure).
    let rateTotal = baseline.rateTotal;
    let rateEmployer = baseline.rateEmployer;
    let rateEmployee = baseline.rateEmployee;

    if (insuranceType === "rentenversicherung") {
      const extracted = extractRate(pageText, "Rentenversicherung");
      if (extracted) rateTotal = extracted;
      // Split total evenly when not explicitly listed
      if (rateTotal) {
        const num = parseFloat(rateTotal);
        if (!isNaN(num)) {
          rateEmployer = `${(num / 2).toFixed(1)}%`;
          rateEmployee = `${(num / 2).toFixed(1)}%`;
        }
      }
    } else if (insuranceType === "krankenversicherung") {
      const extracted = extractRate(pageText, "allgemeiner Beitragssatz");
      if (extracted) rateTotal = extracted;
    } else if (insuranceType === "arbeitslosenversicherung") {
      const extracted = extractRate(pageText, "Arbeitslosenversicherung");
      if (extracted) rateTotal = extracted;
    } else if (insuranceType === "pflegeversicherung") {
      const extracted = extractRate(pageText, "Pflegeversicherung");
      if (extracted) rateTotal = extracted;
    }

    // Try to extract a "valid from" year from the page
    const yearMatch = pageText.match(/(\d{4})/);
    const validFrom = yearMatch
      ? `${yearMatch[1]}-01-01`
      : baseline.validFrom;

    // Additional notes from relevant sections
    const noteSection =
      extractSection($, ["hinweis", "zusatzbeitrag", "besonderheit"]) ??
      baseline.notesDe;

    const record: Omit<ParsedContributionRate, "contentHash"> = {
      insuranceType,
      labelDe: baseline.labelDe,
      rateTotal,
      rateEmployer,
      rateEmployee,
      notesDe: noteSection ?? baseline.notesDe,
      validFrom,
      sourceUrl: baseline.sourceUrl,
    };

    return {
      ...record,
      contentHash: makeHash(record),
    };
  }

  protected async diffRecord(
    record: ParsedContributionRate,
  ): Promise<DiffResult> {
    const existing = await db
      .select({
        id: svContributionRates.id,
        contentHash: svContributionRates.contentHash,
      })
      .from(svContributionRates)
      .where(eq(svContributionRates.insuranceType, record.insuranceType))
      .limit(1);

    if (existing.length === 0) return "new";
    if (existing[0]!.contentHash === record.contentHash) return "unchanged";
    return "updated";
  }

  protected async writeRecord(record: ParsedContributionRate): Promise<void> {
    const now = new Date();
    await db
      .insert(svContributionRates)
      .values({
        insuranceType: record.insuranceType,
        labelDe: record.labelDe,
        rateTotal: record.rateTotal,
        rateEmployer: record.rateEmployer,
        rateEmployee: record.rateEmployee,
        notesDe: record.notesDe,
        validFrom: record.validFrom,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
      })
      .onConflictDoUpdate({
        target: svContributionRates.insuranceType,
        set: {
          labelDe: record.labelDe,
          rateTotal: record.rateTotal,
          rateEmployer: record.rateEmployer,
          rateEmployee: record.rateEmployee,
          notesDe: record.notesDe,
          validFrom: record.validFrom,
          sourceUrl: record.sourceUrl,
          contentHash: record.contentHash,
          scrapedAt: now,
          updatedAt: now,
        },
      });
  }
}

// ─── SvPflichtenScraper ───────────────────────────────────────────────────────
// Scrapes employer obligations from bmas.bund.de and related official sources.
//
// Strategy: fragment-encoded URLs per obligation type; parsePage() attempts to
// enrich baseline text with live page content, falls back to baseline.

const OBLIGATION_SOURCE_URLS: Record<string, string> = {
  anmeldung_neuer_mitarbeiter:
    "https://www.arbeitsagentur.de/unternehmen/personalfragen/meldepflichten#sv-obl=anmeldung_neuer_mitarbeiter",
  krankenkassenwahl: `${BMAS_URL}#sv-obl=krankenkassenwahl`,
  sozialversicherungsausweis: `${DRV_BEITRAEGE_URL}#sv-obl=sozialversicherungsausweis`,
  minijob_regelungen: `${MINIJOB_URL}#sv-obl=minijob_regelungen`,
  lohnfortzahlung_krankheitsfall: `${BMAS_URL}#sv-obl=lohnfortzahlung_krankheitsfall`,
  urlaubsanspruch: `${BMAS_URL}#sv-obl=urlaubsanspruch`,
  kuendigungsschutz_basics: `${BMAS_URL}#sv-obl=kuendigungsschutz_basics`,
  selbststaendige_rv_pflicht: `${DRV_BEITRAEGE_URL}#sv-obl=selbststaendige_rv_pflicht`,
};

class SvPflichtenScraper extends BaseScraper<ParsedObligation> {
  constructor() {
    super({
      pipelineName: "scrape-sv-pflichten",
      pipelineDescription:
        "Scrapes German employer obligations (Meldepflichten, Arbeitgeberpflichten) from bmas.bund.de, arbeitsagentur.de, and related primary sources",
      pipelineSchedule: "0 4 * * 1", // every Monday at 04:00 UTC
      requestDelayMs: 2000,
    });
  }

  protected async fetchUrls(_page: Page): Promise<string[]> {
    return Object.values(OBLIGATION_SOURCE_URLS);
  }

  protected parsePage(html: string, url: string): ParsedObligation | null {
    // Extract obligation type from the fragment
    const oblMatch = url.match(/sv-obl=([^&]+)/);
    const obligationType = oblMatch
      ? decodeURIComponent(oblMatch[1]!)
      : null;
    if (!obligationType) return null;

    const baseline = BASELINE_OBLIGATIONS.find(
      (o) => o.obligationType === obligationType,
    );
    if (!baseline) return null;

    const $ = cheerio.load(html);

    // Attempt to pull a more specific description from the live page.
    // Fall back to baseline when page structure doesn't match expected headings.
    const liveSection =
      extractSection($, [
        "meldepflicht",
        "anmeldung",
        "krankenversicherung",
        "urlaubsanspruch",
        "lohnfortzahlung",
        "kündigungsschutz",
        "rentenversicherungspflicht",
        "minijob",
      ]) ?? null;

    const descriptionDe =
      liveSection && liveSection.length > 100
        ? liveSection
        : baseline.descriptionDe;

    const record: Omit<ParsedObligation, "contentHash"> = {
      obligationType,
      labelDe: baseline.labelDe,
      descriptionDe,
      descriptionEn: baseline.descriptionEn,
      deadlineInfo: baseline.deadlineInfo,
      appliesTo: baseline.appliesTo,
      legalBasis: baseline.legalBasis,
      sourceUrl: baseline.sourceUrl,
    };

    return {
      ...record,
      contentHash: makeHash(record),
    };
  }

  protected async diffRecord(record: ParsedObligation): Promise<DiffResult> {
    const existing = await db
      .select({
        id: svObligations.id,
        contentHash: svObligations.contentHash,
      })
      .from(svObligations)
      .where(eq(svObligations.obligationType, record.obligationType))
      .limit(1);

    if (existing.length === 0) return "new";
    if (existing[0]!.contentHash === record.contentHash) return "unchanged";
    return "updated";
  }

  protected async writeRecord(record: ParsedObligation): Promise<void> {
    const now = new Date();
    await db
      .insert(svObligations)
      .values({
        obligationType: record.obligationType,
        labelDe: record.labelDe,
        descriptionDe: record.descriptionDe,
        descriptionEn: record.descriptionEn,
        deadlineInfo: record.deadlineInfo,
        appliesTo: record.appliesTo,
        legalBasis: record.legalBasis,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
      })
      .onConflictDoUpdate({
        target: svObligations.obligationType,
        set: {
          labelDe: record.labelDe,
          descriptionDe: record.descriptionDe,
          descriptionEn: record.descriptionEn,
          deadlineInfo: record.deadlineInfo,
          appliesTo: record.appliesTo,
          legalBasis: record.legalBasis,
          sourceUrl: record.sourceUrl,
          contentHash: record.contentHash,
          scrapedAt: now,
          updatedAt: now,
        },
      });
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/** Run both Sozialversicherung scrapers sequentially. */
export async function scrapeSozialversicherung(): Promise<void> {
  const beitraegeScraper = new SvBeitraegeScraper();
  const beitraegeStats = await beitraegeScraper.run();
  console.log(
    `[scrape-sv-beitraege] Done — new: ${beitraegeStats.newCount}, ` +
      `updated: ${beitraegeStats.updatedCount}, ` +
      `unchanged: ${beitraegeStats.unchangedCount}, ` +
      `errors: ${beitraegeStats.errorCount}`,
  );

  const pflichtenScraper = new SvPflichtenScraper();
  const pflichtenStats = await pflichtenScraper.run();
  console.log(
    `[scrape-sv-pflichten] Done — new: ${pflichtenStats.newCount}, ` +
      `updated: ${pflichtenStats.updatedCount}, ` +
      `unchanged: ${pflichtenStats.unchangedCount}, ` +
      `errors: ${pflichtenStats.errorCount}`,
  );
}
