import { pgTable, serial, text, timestamp, varchar, boolean, } from "drizzle-orm/pg-core";
// ─── Genehmigungen & branchenspezifische Auflagen (Silo 5) ───────────────────
//
// Stores permit requirements and industry-specific regulatory obligations for
// German business founders.
//
// Primary sources (each row links back to an authoritative primary source):
//   - gesetze-im-internet.de/gewo/ — Gewerbeordnung (GewO); binding federal law for
//     erlaubnispflichtige Gewerbe (§§ 30–38, 55 GewO)
//   - gesetze-im-internet.de/hwo/ — Handwerksordnung (HwO); binding federal law for
//     Meisterpflicht trades (Anlage A HwO)
//   - ihk.de — IHK portals; practical guidance on which Gewerbe require a permit
//   - hwk.de — HWK portals; Meisterpflicht and Handwerk regulation
//   - gewerbeaufsicht.de — state trade supervision authorities (Gewerbeaufsichtsämter)
// ─── permits ──────────────────────────────────────────────────────────────────
// One row per permit type / trade category combination.
// permit_category groups records into:
//   "erlaubnispflichtiges_gewerbe" — GewO special permits
//   "meisterpflicht"               — HwO Anlage A mandatory Meisterbrief trades
//   "konzession"                   — sector-specific concessions (Taxi, Fahrschule, etc.)
//   "ueberwachungsbeduerftige_anlage" — mandatory inspection obligations (§§ 37-39 GewO)
export const permits = pgTable("permits", {
    id: serial("id").primaryKey(),
    // Unique slug identifier (e.g. "gaststättengewerbe", "elektrotechniker-handwerk")
    permitKey: varchar("permit_key", { length: 128 }).notNull().unique(),
    // High-level grouping: "erlaubnispflichtiges_gewerbe", "meisterpflicht",
    // "konzession", "ueberwachungsbeduerftige_anlage"
    permitCategory: varchar("permit_category", { length: 64 }).notNull(),
    // Trade/sector category (e.g. "gastronomie_tourismus", "handwerk_bau",
    // "finanzdienstleistungen", "transport_logistik")
    tradeCategory: varchar("trade_category", { length: 128 }).notNull(),
    // The specific permit type required (e.g. "Gaststättenerlaubnis", "Meisterpflicht",
    // "Bewachungserlaubnis")
    permitType: varchar("permit_type", { length: 128 }).notNull(),
    // Human-readable label in German
    labelDe: varchar("label_de", { length: 256 }),
    // Full description of the requirement (German)
    descriptionDe: text("description_de"),
    // Which authority issues or oversees this permit
    authorityType: varchar("authority_type", { length: 256 }),
    // "federal", "state", or "local"
    authorityLevel: varchar("authority_level", { length: 32 }),
    // Documents required for the application (free text, comma-separated or structured)
    requiredDocuments: text("required_documents"),
    // Cost range as text (e.g. "100–500 €")
    costsEur: varchar("costs_eur", { length: 128 }),
    // Processing time as text (e.g. "14–60 Tage")
    processingTimeDays: varchar("processing_time_days", { length: 64 }),
    // Legal basis (e.g. "§ 34a GewO", "Anlage A Nr. 25 HwO")
    legalBasis: varchar("legal_basis", { length: 256 }),
    // Provenance
    sourceUrl: text("source_url").notNull(),
    contentHash: varchar("content_hash", { length: 64 }),
    scrapedAt: timestamp("scraped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
// ─── berufsgenossenschaften ───────────────────────────────────────────────────
// One row per statutory accident insurance institution (Berufsgenossenschaft).
// Every German employer is mandatory member of the relevant BG for their sector.
//
// Primary source: dguv.de — Deutsche Gesetzliche Unfallversicherung;
// authoritative list of all BGs and their sector assignments.
export const berufsgenossenschaften = pgTable("berufsgenossenschaften", {
    id: serial("id").primaryKey(),
    // Unique slug (e.g. "bg-bau", "bgn", "vbg")
    bgKey: varchar("bg_key", { length: 64 }).notNull().unique(),
    // Full official name
    name: varchar("name", { length: 256 }).notNull(),
    // Abbreviation (e.g. "BG BAU", "BGN", "VBG")
    shortName: varchar("short_name", { length: 64 }),
    // Description of covered sectors
    sectorDescription: text("sector_description"),
    // Comma-separated list of sectors/industries covered
    sectors: text("sectors"),
    // Whether membership is mandatory by law (always true for statutory BGs)
    membershipMandatory: boolean("membership_mandatory").notNull().default(true),
    // Official website
    websiteUrl: text("website_url"),
    // Provenance
    sourceUrl: text("source_url").notNull(),
    contentHash: varchar("content_hash", { length: 64 }),
    scrapedAt: timestamp("scraped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
//# sourceMappingURL=genehmigungen.js.map