import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
  varchar
} from "drizzle-orm/pg-core";
const svContributionRates = pgTable("sv_contribution_rates", {
  id: serial("id").primaryKey(),
  // Unique key for each insurance branch
  insuranceType: varchar("insurance_type", { length: 128 }).notNull().unique(),
  // e.g. "krankenversicherung", "rentenversicherung", "arbeitslosenversicherung",
  //      "pflegeversicherung", "minijob_pauschalbeitrag"
  // Human-readable label in German
  labelDe: varchar("label_de", { length: 256 }),
  // Rates as text to preserve percent notation (e.g. "14.6%", "18.6%")
  rateTotal: varchar("rate_total", { length: 64 }),
  rateEmployer: varchar("rate_employer", { length: 64 }),
  // Arbeitgeberanteil
  rateEmployee: varchar("rate_employee", { length: 64 }),
  // Arbeitnehmeranteil
  // Additional notes, e.g. "avg. Zusatzbeitrag ~1.7% (varies by Krankenkasse)"
  notesDe: text("notes_de"),
  // The calendar year or date these rates are valid from (e.g. "2025-01-01")
  validFrom: varchar("valid_from", { length: 32 }),
  // Provenance
  sourceUrl: text("source_url").notNull(),
  contentHash: varchar("content_hash", { length: 64 }),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  // BRIN index for freshness-based queries (DAT-53)
  scrapedBrin: index("idx_sv_contribution_rates_scraped_brin").on(t.scrapedAt)
}));
const svObligations = pgTable("sv_obligations", {
  id: serial("id").primaryKey(),
  // Unique key for each obligation category
  obligationType: varchar("obligation_type", { length: 128 }).notNull().unique(),
  // e.g. "anmeldung_neuer_mitarbeiter", "krankenkassenwahl", "minijob_regelungen",
  //      "lohnfortzahlung_krankheit", "urlaubsanspruch", "kuendigungsschutz",
  //      "sv_ausweis", "selbststaendige_rv_pflicht"
  // Human-readable label
  labelDe: varchar("label_de", { length: 256 }),
  // Full descriptions
  descriptionDe: text("description_de"),
  descriptionEn: text("description_en"),
  // Deadline or timing info (e.g. "innerhalb von 6 Wochen nach Beschäftigungsbeginn")
  deadlineInfo: text("deadline_info"),
  // Who this obligation applies to (e.g. "Arbeitgeber", "Selbstständige", "Minijobber")
  appliesTo: varchar("applies_to", { length: 256 }),
  // Legal basis (e.g. "§ 28a SGB IV")
  legalBasis: varchar("legal_basis", { length: 256 }),
  // Provenance
  sourceUrl: text("source_url").notNull(),
  contentHash: varchar("content_hash", { length: 64 }),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
export {
  svContributionRates,
  svObligations
};
