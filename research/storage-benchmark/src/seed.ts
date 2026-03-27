/**
 * Generates synthetic funding-program records that mirror the real Sophex schema.
 * Used by all benchmark runners as a common dataset baseline.
 *
 * Characteristics modeled:
 *   - ~800 bytes of text per record (title_de + description_de + legal_requirements)
 *   - Enum-like fields: funding_type (5 values), state (16 Bundesländer), level (3 values)
 *   - A content_hash + last_scraped_at for provenance / temporal patterns
 *   - version counter for changelog simulation
 */

import { randomBytes } from "crypto";

const FUNDING_TYPES = ["Zuschuss", "Darlehen", "Garantie", "Beteiligung", "Steuervorteile"];
const FUNDING_AREAS = ["Existenzgründung", "Forschung & Innovation", "Digitalisierung", "Internationalisierung", "Energie & Umwelt"];
const STATES = [
  "Bundesweit", "Baden-Württemberg", "Bayern", "Berlin", "Brandenburg",
  "Bremen", "Hamburg", "Hessen", "Mecklenburg-Vorpommern", "Niedersachsen",
  "Nordrhein-Westfalen", "Rheinland-Pfalz", "Saarland", "Sachsen",
  "Sachsen-Anhalt", "Schleswig-Holstein", "Thüringen",
];
const LEVELS = ["bund", "land", "eu"];
const RECHTSFORMEN = ["GmbH", "UG", "AG", "GbR", "Einzelunternehmen", "OHG", "KG"];

function sha256hex(input: string): string {
  return randomBytes(32).toString("hex"); // deterministic in real usage; random here for speed
}

function loremIpsum(wordCount: number): string {
  const words = [
    "Förderung", "Unternehmen", "Antrag", "Bewilligung", "Bundesministerium",
    "Innovationen", "Digitalisierung", "Nachhaltigkeit", "Voraussetzungen",
    "Förderbetrag", "Zuwendungen", "Kapitalgesellschaft", "Gründungsphase",
    "Wirtschaftsförderung", "Bundesland", "Mittelstand", "Investitionen",
    "Beihilferegelungen", "Förderprogramm", "Rechtsgrundlage", "Richtlinie",
  ];
  const chunks: string[] = [];
  for (let i = 0; i < wordCount; i++) {
    chunks.push(words[Math.floor(Math.random() * words.length)]);
  }
  return chunks.join(" ") + ".";
}

export interface SeedRecord {
  slug: string;
  title_de: string;
  title_en: string;
  funding_type: string;
  funding_area: string;
  funding_region: string;
  eligible_applicants: string;
  summary_de: string;
  description_de: string;
  legal_requirements_de: string;
  funding_amount_info: string;
  level: string;
  state: string;
  category: string;
  source_url: string;
  source_id: string;
  is_active: boolean;
  version: number;
  content_hash: string;
  last_scraped_at: Date;
  created_at: Date;
  updated_at: Date;
  // For JSONB variant — entire record packed into one column
  raw_json?: object;
}

export function generateRecords(count: number, startIndex = 0): SeedRecord[] {
  const records: SeedRecord[] = [];
  const baseDate = new Date("2024-01-01T00:00:00Z");

  for (let i = startIndex; i < startIndex + count; i++) {
    const state = STATES[i % STATES.length];
    const level = LEVELS[i % LEVELS.length];
    const fundingType = FUNDING_TYPES[i % FUNDING_TYPES.length];
    const area = FUNDING_AREAS[i % FUNDING_AREAS.length];
    const rechtsform = RECHTSFORMEN[i % RECHTSFORMEN.length];
    const version = Math.floor(Math.random() * 5) + 1;

    // Offset scraped_at across a 12-month window so temporal queries are meaningful
    const scrapedAt = new Date(baseDate.getTime() + (i % 365) * 86_400_000);
    const createdAt = new Date(baseDate.getTime() + Math.floor(i / 10) * 86_400_000);

    const slug = `fp-${i.toString().padStart(6, "0")}`;
    const titleDe = `${area} Programm ${i} — ${fundingType} für ${rechtsform}`;
    const titleEn = `${area} Program ${i} — ${fundingType} for ${rechtsform}`;
    const summaryDe = loremIpsum(40);
    const descriptionDe = loremIpsum(120);
    const legalRequirementsDe = loremIpsum(60);
    const contentHash = sha256hex(`${slug}-v${version}`);

    const rec: SeedRecord = {
      slug,
      title_de: titleDe,
      title_en: titleEn,
      funding_type: fundingType,
      funding_area: area,
      funding_region: state,
      eligible_applicants: rechtsform,
      summary_de: summaryDe,
      description_de: descriptionDe,
      legal_requirements_de: legalRequirementsDe,
      funding_amount_info: `Bis zu ${(i % 500 + 1) * 1000} EUR`,
      level,
      state,
      category: area.toLowerCase().replace(/[^a-z]/g, "_"),
      source_url: `https://foerderdatenbank.de/fp/${slug}`,
      source_id: `FD-${i}`,
      is_active: i % 20 !== 0, // ~5% inactive
      version,
      content_hash: contentHash,
      last_scraped_at: scrapedAt,
      created_at: createdAt,
      updated_at: scrapedAt,
    };

    rec.raw_json = rec; // used for JSONB variant
    records.push(rec);
  }
  return records;
}
