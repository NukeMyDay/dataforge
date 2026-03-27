import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";
export const webhooks = pgTable("webhooks", {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    events: text("events").array().notNull().default([]),
    secret: text("secret").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    description: text("description"),
    failureCount: integer("failure_count").notNull().default(0),
    lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const webhookDeliveries = pgTable("webhook_deliveries", {
    id: serial("id").primaryKey(),
    webhookId: integer("webhook_id").notNull().references(() => webhooks.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    statusCode: integer("status_code"),
    responseBody: text("response_body"),
    durationMs: integer("duration_ms"),
    success: boolean("success").notNull().default(false),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
});
//# sourceMappingURL=webhooks.js.map