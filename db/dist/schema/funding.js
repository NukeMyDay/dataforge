import { integer, pgTable, index, serial, text, timestamp, varchar, boolean } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { pipelineRuns } from "./pipelines.js";
const fundingPrograms = pgTable("funding_programs", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 512 }).notNull().unique(),
  // Core info
  titleDe: text("title_de").notNull(),
  titleEn: text("title_en"),
  // Structured metadata from foerderdatenbank.de
  fundingType: text("funding_type"),
  // Förderart: Zuschuss, Darlehen, Garantie, etc.
  fundingArea: text("funding_area"),
  // Förderbereich: Existenzgründung, Forschung, etc.
  fundingRegion: text("funding_region"),
  // Fördergebiet: Bund, NRW, Sachsen, etc.
  eligibleApplicants: text("eligible_applicants"),
  // Förderberechtigte
  contactInfo: text("contact_info"),
  // Ansprechpunkt (full text block)
  // Content - vollständig, nicht nur Teaser
  summaryDe: text("summary_de"),
  // Kurztext
  descriptionDe: text("description_de"),
  // Volltext - kompletter Fließtext
  legalRequirementsDe: text("legal_requirements_de"),
  // Rechtliche Voraussetzungen
  directiveDe: text("directive_de"),
  // Richtlinie / Rechtsgrundlage (vollständig)
  // English translations (for future enrichment)
  summaryEn: text("summary_en"),
  descriptionEn: text("description_en"),
  legalRequirementsEn: text("legal_requirements_en"),
  // Additional structured data
  fundingAmountInfo: text("funding_amount_info"),
  // Extracted max amounts, percentages etc.
  applicationProcess: text("application_process"),
  // How to apply
  deadlineInfo: text("deadline_info"),
  // Deadlines if mentioned
  // Categorization
  level: varchar("level", { length: 32 }),
  // bund, land, eu
  state: varchar("state", { length: 64 }),
  // Bundesland if applicable
  category: varchar("category", { length: 128 }),
  // Derived category
  // Source & tracking
  sourceUrl: text("source_url").notNull(),
  sourceId: varchar("source_id", { length: 256 }),
  // ID from source site if available
  isActive: boolean("is_active").notNull().default(true),
  // Versioning
  version: integer("version").notNull().default(1),
  contentHash: varchar("content_hash", { length: 64 }),
  // SHA-256 of content for change detection
  // Provenance: when this record was last scraped (even if content unchanged)
  lastScrapedAt: timestamp("last_scraped_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  // BRIN index for freshness-based queries (DAT-53)
  lastScrapedBrin: index("idx_funding_programs_last_scraped_brin").on(t.lastScrapedAt),
  // Partial index for active-record read paths (DAT-53)
  activePartial: index("idx_funding_programs_active_partial").on(t.id).where(sql`is_active = TRUE`)
}));
const fundingChangelog = pgTable("funding_changelog", {
  id: serial("id").primaryKey(),
  fundingProgramId: integer("funding_program_id").notNull().references(() => fundingPrograms.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  changesDe: text("changes_de"),
  changesEn: text("changes_en"),
  // Provenance: content hash at this version and which scrape run produced the change
  contentHash: varchar("content_hash", { length: 64 }),
  scrapeRunId: integer("scrape_run_id").references(() => pipelineRuns.id, { onDelete: "set null" }),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow()
});
export {
  fundingChangelog,
  fundingPrograms
};
