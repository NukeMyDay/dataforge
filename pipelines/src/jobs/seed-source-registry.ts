// Seed job: populates source_registry with all current Sophex data sources.
//
// Each entry documents why the source is authoritative: the government body name,
// its legal standing, and the pipeline that scrapes it.
//
// Run once after migration 0016, or re-run idempotently at any time (upsert).

import { db, sourceRegistry } from "@dataforge/db";
import { sql } from "drizzle-orm";

interface SourceEntry {
  sourceUrl: string;
  authorityName: string;
  authorityType: "federal" | "state" | "chamber" | "association";
  legalBasis: string | null;
  scraperName: string;
  dataDomain: string;
  notes: string | null;
}

const SOURCES: SourceEntry[] = [
  // ─── Funding programs ──────────────────────────────────────────────────────
  {
    sourceUrl: "https://www.foerderdatenbank.de",
    authorityName: "Bundesministerium für Wirtschaft und Klimaschutz (BMWK)",
    authorityType: "federal",
    legalBasis: "Betrieb nach §§ 1–3 BWKG; Förderdatenbank ist das offizielle Portal des Bundes",
    scraperName: "scrape-funding-bund",
    dataDomain: "funding",
    notes:
      "Official German federal funding portal operated by BMWK. Aggregates federal, state, and EU funding programs available to German businesses and founders.",
  },

  // ─── Rechtsformen & Gewerbeanmeldung ───────────────────────────────────────
  {
    sourceUrl: "https://www.existenzgruender.de",
    authorityName: "Bundesministerium für Wirtschaft und Klimaschutz (BMWK) — BMWi-Existenzgründerportal",
    authorityType: "federal",
    legalBasis: "Offizielle Informationsplattform nach GewO, GmbHG, AktG, HGB",
    scraperName: "scrape-rechtsformen",
    dataDomain: "rechtsformen",
    notes:
      "Federal portal for business founders. Primary authoritative source for German legal entity types (Rechtsformen) and their founding requirements under German commercial law.",
  },

  // ─── Sozialversicherung & Arbeitsrecht ─────────────────────────────────────
  {
    sourceUrl: "https://www.deutsche-rentenversicherung.de",
    authorityName: "Deutsche Rentenversicherung Bund",
    authorityType: "association",
    legalBasis: "SGB VI (Sechstes Buch Sozialgesetzbuch — Gesetzliche Rentenversicherung)",
    scraperName: "scrape-sozialversicherung",
    dataDomain: "sozialversicherung",
    notes:
      "Statutory pension insurance body. Authoritative source for retirement insurance contribution rates and employer obligations.",
  },
  {
    sourceUrl: "https://www.gkv-spitzenverband.de",
    authorityName: "GKV-Spitzenverband (Spitzenverband Bund der Krankenkassen)",
    authorityType: "association",
    legalBasis: "SGB V § 217a (Fünftes Buch Sozialgesetzbuch — Gesetzliche Krankenversicherung)",
    scraperName: "scrape-sozialversicherung",
    dataDomain: "sozialversicherung",
    notes:
      "Central association of statutory health insurance funds. Sets and publishes unified contribution rates and employer obligations for health insurance (Krankenversicherung).",
  },
  {
    sourceUrl: "https://www.arbeitsagentur.de",
    authorityName: "Bundesagentur für Arbeit",
    authorityType: "federal",
    legalBasis: "SGB III § 1 (Drittes Buch Sozialgesetzbuch — Arbeitsförderung)",
    scraperName: "scrape-sozialversicherung",
    dataDomain: "sozialversicherung",
    notes:
      "Federal Employment Agency. Authoritative source for unemployment insurance (Arbeitslosenversicherung) contribution rates and employer registration obligations.",
  },
  {
    sourceUrl: "https://www.minijob-zentrale.de",
    authorityName: "Deutsche Rentenversicherung Knappschaft-Bahn-See (Minijob-Zentrale)",
    authorityType: "association",
    legalBasis: "SGB IV § 28i; Geringfügigkeitsrichtlinien",
    scraperName: "scrape-sozialversicherung",
    dataDomain: "sozialversicherung",
    notes:
      "Central clearing house for marginal employment (minijobs). Authoritative source for flat-rate contribution obligations for employers of mini-jobbers.",
  },
  {
    sourceUrl: "https://www.bundesgesundheitsministerium.de",
    authorityName: "Bundesministerium für Gesundheit (BMG)",
    authorityType: "federal",
    legalBasis: "SGB V (Fünftes Buch Sozialgesetzbuch — Gesetzliche Krankenversicherung)",
    scraperName: "scrape-sozialversicherung",
    dataDomain: "sozialversicherung",
    notes:
      "Federal Ministry of Health. Publishes official Zusatzbeitragssatz (supplementary contribution rate) as determined by the Schätzerkreis, binding for all statutory health insurance funds.",
  },

  // ─── Steuerliche Pflichten ─────────────────────────────────────────────────
  {
    sourceUrl: "https://www.bundesfinanzministerium.de",
    authorityName: "Bundesministerium der Finanzen (BMF)",
    authorityType: "federal",
    legalBasis: "AO, EStG, KStG, UStG, GewStG",
    scraperName: "scrape-steuern",
    dataDomain: "steuern",
    notes:
      "Federal Ministry of Finance. Primary legislative and policy authority for German tax law. Publishes official tax rates, filing deadlines, and employer obligations.",
  },
  {
    sourceUrl: "https://www.elster.de",
    authorityName: "ELSTER — Elektronische Steuererklärung (Finanzverwaltungen der Länder)",
    authorityType: "federal",
    legalBasis: "§ 87a AO (Abgabenordnung — Elektronische Kommunikation mit Finanzbehörden)",
    scraperName: "scrape-steuern",
    dataDomain: "steuern",
    notes:
      "Joint platform of German state tax authorities for electronic tax filing. Authoritative source for tax registration procedures, deadlines, and filing requirements.",
  },

  // ─── Genehmigungen & Berufsgenossenschaften ────────────────────────────────
  {
    sourceUrl: "https://www.gesetze-im-internet.de",
    authorityName: "Bundesministerium der Justiz (BMJ) — Bundesrecht im Internet",
    authorityType: "federal",
    legalBasis: "§ 15 GGO (Gemeinsame Geschäftsordnung der Bundesministerien)",
    scraperName: "scrape-genehmigungen",
    dataDomain: "genehmigungen",
    notes:
      "Official portal for German federal statutory law, operated by the Federal Ministry of Justice. Primary source for permit requirements and licensing obligations under GewO, PBefG, etc.",
  },
  {
    sourceUrl: "https://www.ihk.de",
    authorityName: "Deutscher Industrie- und Handelskammertag (DIHK)",
    authorityType: "chamber",
    legalBasis: "IHKG (Gesetz zur vorläufigen Regelung des Rechts der Industrie- und Handelskammern)",
    scraperName: "scrape-genehmigungen",
    dataDomain: "genehmigungen",
    notes:
      "German Chambers of Commerce and Industry. Statutory body responsible for administering trade permits and professional licensing for most commercial trades.",
  },
  {
    sourceUrl: "https://www.hwk.de",
    authorityName: "Zentralverband des Deutschen Handwerks (ZDH)",
    authorityType: "chamber",
    legalBasis: "HwO (Handwerksordnung)",
    scraperName: "scrape-genehmigungen",
    dataDomain: "genehmigungen",
    notes:
      "German Crafts Confederation. Statutory body for the skilled trades sector. Authoritative source for Meisterpflicht (master craftsman requirement) and craft permit obligations.",
  },
  {
    sourceUrl: "https://www.dguv.de",
    authorityName: "Deutsche Gesetzliche Unfallversicherung (DGUV)",
    authorityType: "association",
    legalBasis: "SGB VII (Siebtes Buch Sozialgesetzbuch — Gesetzliche Unfallversicherung)",
    scraperName: "scrape-genehmigungen",
    dataDomain: "genehmigungen",
    notes:
      "German Social Accident Insurance. Umbrella body of statutory accident insurance institutions (Berufsgenossenschaften). Authoritative source for mandatory occupational accident insurance membership by sector.",
  },

  // ─── Handelsregister & Notarpflichten ─────────────────────────────────────
  {
    sourceUrl: "https://www.handelsregister.de",
    authorityName: "Länder — Justizministerien (via gemeinsames Registerportal der Länder)",
    authorityType: "state",
    legalBasis: "HGB §§ 8–16 (Handelsgesetzbuch — Handelsregister); § 10 HRV",
    scraperName: "scrape-handelsregister",
    dataDomain: "handelsregister",
    notes:
      "Official joint portal of German state justice ministries for the commercial register (Handelsregister). Authoritative source for registration requirements and obligations per Rechtsform.",
  },
  {
    sourceUrl: "https://www.bundesnotarkammer.de",
    authorityName: "Bundesnotarkammer",
    authorityType: "chamber",
    legalBasis: "BNotO (Bundesnotarordnung); GNotKG (Gerichts- und Notarkostengesetz)",
    scraperName: "scrape-handelsregister",
    dataDomain: "handelsregister",
    notes:
      "Federal Chamber of Notaries. Authoritative source for notarization requirements (Notarpflicht) and notarial act cost tables under GNotKG for German founding processes.",
  },
];

export async function seedSourceRegistry(): Promise<void> {
  console.log(`[seed-source-registry] Seeding ${SOURCES.length} source registry entries...`);

  for (const entry of SOURCES) {
    await db
      .insert(sourceRegistry)
      .values({
        ...entry,
        verifiedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: sourceRegistry.sourceUrl,
        set: {
          authorityName: sql`excluded.authority_name`,
          authorityType: sql`excluded.authority_type`,
          legalBasis: sql`excluded.legal_basis`,
          scraperName: sql`excluded.scraper_name`,
          dataDomain: sql`excluded.data_domain`,
          notes: sql`excluded.notes`,
          verifiedAt: sql`excluded.verified_at`,
          updatedAt: sql`now()`,
        },
      });

    console.log(`[seed-source-registry] Upserted: ${entry.sourceUrl}`);
  }

  console.log("[seed-source-registry] Done.");
}

// Allow direct execution: npx tsx pipelines/src/jobs/seed-source-registry.ts
if (process.argv[1]?.endsWith("seed-source-registry.ts") || process.argv[1]?.endsWith("seed-source-registry.js")) {
  seedSourceRegistry()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
