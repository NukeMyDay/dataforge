import { integer, numeric, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { institutions } from "./institutions.js";

export const programs = pgTable("programs", {
  id: serial("id").primaryKey(),
  institutionId: integer("institution_id")
    .notNull()
    .references(() => institutions.id, { onDelete: "cascade" }),
  titleDe: text("title_de"),
  titleEn: text("title_en"),
  titleNl: text("title_nl"),
  degreeType: varchar("degree_type", { length: 64 }).notNull(),
  durationMonths: integer("duration_months"),
  language: varchar("language", { length: 16 }),
  deliveryMode: varchar("delivery_mode", { length: 32 }),
  tuitionFeeEur: numeric("tuition_fee_eur", { precision: 10, scale: 2 }),
  sourceUrl: text("source_url"),
  country: varchar("country", { length: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
