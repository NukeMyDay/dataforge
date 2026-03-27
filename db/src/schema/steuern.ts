import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  boolean,
} from "drizzle-orm/pg-core";

// ─── Steuerliche Pflichten für Gründer (Silo 3) ───────────────────────────────
//
// Stores tax obligations for German business founders, broken down by Rechtsform.
//
// Primary sources (each row links back to an authoritative primary source):
//   - bundesfinanzministerium.de — Federal Ministry of Finance; primary authority
//     for German tax law, Körperschaftsteuer, and Einkommensteuer
//   - elster.de — Official German tax portal operated by the Finanzverwaltung;
//     primary source for registration procedures (Fragebogen zur steuerlichen
//     Erfassung) and Voranmeldungen
//   - bundesrat.de / bundestag.de — Primary legal texts (EStG, KStG, UStG, GewStG)
//   - Landesfinanzministerien — State-specific Gewerbesteuer-Hebesätze

export const taxObligations = pgTable("tax_obligations", {
  id: serial("id").primaryKey(),

  // Which Rechtsform this obligation applies to.
  // Use "all" for obligations that apply to all Rechtsformen.
  // Slugs match the rechtsformen table (e.g. "gmbh", "ug", "einzelunternehmen",
  // "freiberufler", "gbr", "all").
  rechtsformSlug: varchar("rechtsform_slug", { length: 64 }).notNull(),

  // Internal identifier for the tax type (e.g. "koerperschaftsteuer", "einkommensteuer")
  taxType: varchar("tax_type", { length: 128 }).notNull(),

  // Human-readable label in German
  labelDe: varchar("label_de", { length: 256 }),

  // Full descriptions
  descriptionDe: text("description_de"),
  descriptionEn: text("description_en"),

  // Rate info as text (e.g. "15% zzgl. Solidaritätszuschlag", "Hebesatz × Messbetrag")
  rateInfo: varchar("rate_info", { length: 256 }),

  // How often a filing/payment is required (e.g. "monatlich", "quartalsweise", "jährlich")
  filingFrequency: varchar("filing_frequency", { length: 64 }),

  // Whether formal registration with Finanzamt is required for this tax
  registrationRequired: boolean("registration_required").default(false),

  // Whether Kleinunternehmerregelung (§ 19 UStG) is relevant to this obligation
  kleinunternehmerRelevant: boolean("kleinunternehmer_relevant").default(false),

  // Legal basis (e.g. "§ 15 EStG", "§ 23 KStG")
  legalBasis: varchar("legal_basis", { length: 256 }),

  // Provenance
  sourceUrl: text("source_url").notNull(),
  contentHash: varchar("content_hash", { length: 64 }),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // BRIN index for freshness-based queries (DAT-53)
  scrapedBrin: index("idx_tax_obligations_scraped_brin").on(t.scrapedAt),
}));

// ─── tax_deadlines ────────────────────────────────────────────────────────────
// Key filing deadlines and payment due dates for German business taxes.
// Sources:
//   - bundesfinanzministerium.de — official annual Steuerkalender
//   - elster.de — Voranmeldung and Jahreserklärung deadlines
//   - bundestag.de — EStG, UStG, GewStG (statutory deadlines)

export const taxDeadlines = pgTable("tax_deadlines", {
  id: serial("id").primaryKey(),

  // The tax this deadline applies to (e.g. "umsatzsteuer", "gewerbesteuer")
  taxType: varchar("tax_type", { length: 128 }).notNull(),

  // What triggers this deadline (e.g. "jahresende", "quartalsende", "gruendung")
  eventTrigger: varchar("event_trigger", { length: 128 }).notNull(),

  // Human-readable label in German
  labelDe: varchar("label_de", { length: 256 }),

  // Description of the deadline
  deadlineDescription: text("deadline_description"),

  // When the deadline falls (e.g. "10. des Folgemonats", "31. Mai des Folgejahres")
  dueDateInfo: varchar("due_date_info", { length: 256 }),

  // Legal basis (e.g. "§ 18 UStG", "§ 149 AO")
  legalBasis: varchar("legal_basis", { length: 256 }),

  // Provenance
  sourceUrl: text("source_url").notNull(),
  contentHash: varchar("content_hash", { length: 64 }),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
