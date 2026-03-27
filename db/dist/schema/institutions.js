import { doublePrecision, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
export const institutions = pgTable("institutions", {
    id: serial("id").primaryKey(),
    nameDe: text("name_de"),
    nameEn: text("name_en"),
    nameNl: text("name_nl"),
    nameFr: text("name_fr"),
    country: varchar("country", { length: 2 }).notNull(),
    city: text("city"),
    websiteUrl: text("website_url"),
    accreditationStatus: varchar("accreditation_status", { length: 64 }),
    // "university", "university_of_applied_sciences", "college"
    type: varchar("type", { length: 64 }),
    logoUrl: text("logo_url"),
    rankingPosition: integer("ranking_position"),
    descriptionDe: text("description_de"),
    descriptionEn: text("description_en"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    slug: varchar("slug", { length: 256 }).notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
//# sourceMappingURL=institutions.js.map