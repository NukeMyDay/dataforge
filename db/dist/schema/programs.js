import { boolean, integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { institutions } from "./institutions.js";
export const programs = pgTable("programs", {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
        .notNull()
        .references(() => institutions.id, { onDelete: "cascade" }),
    titleDe: text("title_de"),
    titleEn: text("title_en"),
    titleNl: text("title_nl"),
    titleFr: text("title_fr"),
    degreeType: varchar("degree_type", { length: 64 }).notNull(),
    durationMonths: integer("duration_months"),
    language: varchar("language", { length: 16 }),
    deliveryMode: varchar("delivery_mode", { length: 32 }),
    tuitionFeeEur: numeric("tuition_fee_eur", { precision: 10, scale: 2 }),
    sourceUrl: text("source_url"),
    country: varchar("country", { length: 2 }).notNull(),
    descriptionDe: text("description_de"),
    descriptionEn: text("description_en"),
    descriptionNl: text("description_nl"),
    descriptionFr: text("description_fr"),
    ects: integer("ects"),
    fieldOfStudy: varchar("field_of_study", { length: 128 }),
    iscedCode: varchar("isced_code", { length: 16 }),
    applicationDeadlineEu: timestamp("application_deadline_eu", { withTimezone: true }),
    applicationDeadlineNonEu: timestamp("application_deadline_non_eu", { withTimezone: true }),
    // JSON array of date strings, e.g. ["2025-09-01","2026-02-01"]
    startDates: text("start_dates"),
    // JSON object, e.g. {"ielts": "6.5", "toefl": "90"}
    languageRequirements: text("language_requirements"),
    tuitionFeeNonEuEur: numeric("tuition_fee_non_eu_eur", { precision: 10, scale: 2 }),
    numerusClausus: boolean("numerus_clausus").default(false),
    admissionRequirements: text("admission_requirements"),
    satisfactionScore: numeric("satisfaction_score", { precision: 3, scale: 1 }),
    isActive: boolean("is_active").default(true),
    slug: varchar("slug", { length: 512 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
//# sourceMappingURL=programs.js.map