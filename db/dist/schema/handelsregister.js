import { index, pgTable, serial, text, timestamp, varchar, boolean, } from "drizzle-orm/pg-core";
// ─── Handelsregister & Notarpflichten (Silo 6) ───────────────────────────────
//
// Stores trade register obligations and notary requirements for German founders.
//
// Primary sources (each row links back to an authoritative primary source):
//   - handelsregister.de — Official German trade register portal (Bundesministerium der Justiz)
//   - bundesnotarkammer.de — Federal Chamber of Notaries; primary authority for notary requirements
//   - bmj.bund.de — Bundesministerium der Justiz; GmbHG, AktG, HGB legal basis
//   - registerportal.de — Official register portal for Amtsgericht registration procedures
// ─── hr_obligations ───────────────────────────────────────────────────────────
// One row per (rechtsformSlug, obligationType) combination.
// obligationType values:
//   "eintragungspflicht"   — whether/how the Rechtsform must register
//   "eintragungsinhalt"    — what must be registered in the Handelsregister
//   "notarpflicht"         — which acts require notarization
//   "fristen"              — registration deadlines after founding
//   "publizitaetspflicht"  — annual financial statement publication obligations
//   "ablauf"               — step-by-step founding process
export const hrObligations = pgTable("hr_obligations", {
    id: serial("id").primaryKey(),
    // Which Rechtsform this obligation applies to.
    // Slugs: "gmbh", "ug", "ag", "ohg", "kg", "gbr", "einzelunternehmen"
    // Use "all" for obligations that apply to all Rechtsformen.
    rechtsformSlug: varchar("rechtsform_slug", { length: 64 }).notNull(),
    // Type of obligation (see comment above)
    obligationType: varchar("obligation_type", { length: 64 }).notNull(),
    // Human-readable label in German
    labelDe: varchar("label_de", { length: 256 }),
    // Full description (German and English)
    descriptionDe: text("description_de"),
    descriptionEn: text("description_en"),
    // Whether this obligation is mandatory (vs. conditional/optional)
    isMandatory: boolean("is_mandatory").notNull().default(true),
    // Legal basis (e.g. "§ 7 GmbHG", "§ 8 HGB", "§ 12 HGB")
    legalBasis: varchar("legal_basis", { length: 256 }),
    // Provenance
    sourceUrl: text("source_url").notNull(),
    contentHash: varchar("content_hash", { length: 64 }),
    scrapedAt: timestamp("scraped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    // BRIN index for freshness-based queries (DAT-53)
    scrapedBrin: index("idx_hr_obligations_scraped_brin").on(t.scrapedAt),
}));
// ─── notary_costs ─────────────────────────────────────────────────────────────
// One row per notarial act type with GNotKG-based cost examples.
//
// Primary source: bundesnotarkammer.de — Federal Chamber of Notaries;
// authoritative source for GNotKG fee tables and notary cost examples.
export const notaryCosts = pgTable("notary_costs", {
    id: serial("id").primaryKey(),
    // Internal identifier for the notarial act type
    // (e.g. "gmbh_gruendung", "satzungsaenderung", "geschaeftsfuehrerwechsel")
    actType: varchar("act_type", { length: 128 }).notNull().unique(),
    // Human-readable label in German
    labelDe: varchar("label_de", { length: 256 }),
    // How costs are calculated (e.g. "GNotKG Anlage 1 Nr. 21100, Geschäftswert = Stammkapital")
    costBasis: text("cost_basis"),
    // Example cost range as text (e.g. "300–800 €")
    exampleCostEur: varchar("example_cost_eur", { length: 128 }),
    // Additional notes (e.g. Gerichtsgebühren, Handelsregistergebühren on top)
    notes: text("notes"),
    // Legal basis (e.g. "GNotKG Anlage 1 Nr. 21100", "§ 112 GNotKG")
    legalBasis: varchar("legal_basis", { length: 256 }),
    // Provenance
    sourceUrl: text("source_url").notNull(),
    contentHash: varchar("content_hash", { length: 64 }),
    scrapedAt: timestamp("scraped_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
//# sourceMappingURL=handelsregister.js.map