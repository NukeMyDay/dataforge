import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  boolean
} from "drizzle-orm/pg-core";
const permits = pgTable("permits", {
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  // BRIN index for freshness-based queries (DAT-53)
  scrapedBrin: index("idx_permits_scraped_brin").on(t.scrapedAt)
}));
const berufsgenossenschaften = pgTable("berufsgenossenschaften", {
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
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
export {
  berufsgenossenschaften,
  permits
};
