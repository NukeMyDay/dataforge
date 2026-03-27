import { pgTable, text, timestamptz } from "drizzle-orm/pg-core";
export const settings = pgTable("settings", {
    key: text("key").primaryKey(),
    value: text("value"),
    updatedAt: timestamptz("updated_at").defaultNow(),
});
//# sourceMappingURL=settings.js.map