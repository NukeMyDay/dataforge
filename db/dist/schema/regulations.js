import { integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
export const regulations = pgTable("regulations", {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 256 }).notNull().unique(),
    titleDe: text("title_de"),
    titleEn: text("title_en"),
    category: varchar("category", { length: 128 }).notNull(),
    jurisdiction: varchar("jurisdiction", { length: 128 }).notNull(),
    bodyDe: text("body_de"),
    bodyEn: text("body_en"),
    sourceUrl: text("source_url"),
    effectiveDate: timestamp("effective_date", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    // Structured fields for NRW event permit regulations
    responsibleAuthorityDe: text("responsible_authority_de"),
    responsibleAuthorityEn: text("responsible_authority_en"),
    requirementsDe: text("requirements_de"),
    requirementsEn: text("requirements_en"),
    processDe: text("process_de"),
    processEn: text("process_en"),
    deadlineNotesDe: text("deadline_notes_de"),
    deadlineNotesEn: text("deadline_notes_en"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const regulationChangelog = pgTable("regulation_changelog", {
    id: serial("id").primaryKey(),
    regulationId: integer("regulation_id")
        .notNull()
        .references(() => regulations.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    diffSummaryDe: text("diff_summary_de"),
    diffSummaryEn: text("diff_summary_en"),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});
//# sourceMappingURL=regulations.js.map