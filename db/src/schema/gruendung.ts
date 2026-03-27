import {
  boolean,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Rechtsformen ─────────────────────────────────────────────────────────────
// German legal entity types (GmbH, UG, GbR, etc.)
// Primary source: existenzgruender.de (BMWi) — official federal guide for founders,
// maintained by the Federal Ministry for Economic Affairs. This is the authoritative
// source for Rechtsformvergleich (legal entity comparison) in Germany.

export const rechtsformen = pgTable("rechtsformen", {
  id: serial("id").primaryKey(),

  // Identity
  name: varchar("name", { length: 256 }).notNull(),        // e.g. "GmbH"
  slug: varchar("slug", { length: 256 }).notNull().unique(), // e.g. "gmbh"
  fullName: text("full_name"),                              // e.g. "Gesellschaft mit beschränkter Haftung"

  // Core comparison fields
  minCapitalEur: integer("min_capital_eur"),   // Mindestkapital in EUR (null = no statutory minimum)
  liabilityType: varchar("liability_type", { length: 256 }), // Haftung description
  notaryRequired: boolean("notary_required"),  // Notarpflicht beim Gründungsvertrag
  tradeRegisterRequired: boolean("trade_register_required"), // Handelsregisterpflicht

  // Founder requirements
  founderCount: varchar("founder_count", { length: 64 }), // e.g. "min. 1", "min. 2"

  // Descriptions
  descriptionDe: text("description_de"),   // Full description in German
  descriptionEn: text("description_en"),   // Translation (future enrichment)

  // Additional structured content
  taxNotesDe: text("tax_notes_de"),        // Steuerliche Besonderheiten
  foundingCostsDe: text("founding_costs_de"), // Gründungsaufwand

  // Provenance
  sourceUrl: text("source_url").notNull(),
  contentHash: varchar("content_hash", { length: 64 }), // SHA-256 for change detection
  scrapedAt: timestamp("scraped_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Gewerbeanmeldung Info ────────────────────────────────────────────────────
// Business registration requirements per Bundesland.
// Primary source: service.bund.de — federal service portal listing Gewerbeanmeldung
// as an official administrative procedure, with state-level links.
// IHK.de serves as the authoritative guidance source for commercial registration;
// HWK portals cover craft trade (Handwerksbetriebe) specifics.

export const gewerbeanmeldungInfo = pgTable("gewerbeanmeldung_info", {
  id: serial("id").primaryKey(),

  // Scope
  bundesland: varchar("bundesland", { length: 64 }).notNull().unique(),

  // Responsible authority
  zustaendigeStelleDescription: text("zustaendige_stelle_description"), // Which Gewerbeamt/Ordnungsamt handles it

  // Costs and timing
  kostenEur: integer("kosten_eur"),            // Typical registration fee in EUR
  bearbeitungszeitTage: integer("bearbeitungszeit_tage"), // Typical processing time in business days

  // Required documents as a JSON array of strings
  requiredDocuments: jsonb("required_documents").$type<string[]>(),

  // Online availability
  onlineAvailable: boolean("online_available"), // Whether online submission is offered

  // Gewerbe vs. Freier Beruf distinction note
  noteDe: text("note_de"), // Any Bundesland-specific notes (e.g. special rules for crafts)

  // Provenance
  sourceUrl: text("source_url").notNull(),
  contentHash: varchar("content_hash", { length: 64 }),
  scrapedAt: timestamp("scraped_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
