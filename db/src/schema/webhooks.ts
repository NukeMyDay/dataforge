import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users.js";

// ─── webhooks ──────────────────────────────────────────────────────────────────
// Per-user webhook subscriptions. Sophex POSTs to the registered URL whenever a
// subscribed event fires. Secrets are HMAC-SHA256 signing keys (whsec_ prefix).
export const webhooks = pgTable("webhooks", {
  id: serial("id").primaryKey(),

  // Owner — NULL means platform-level (pipeline triggers only)
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),

  // Destination URL for POST deliveries
  url: text("url").notNull(),

  // Subscribed event types (program.created, regulation.updated, pipeline.completed, etc.)
  events: text("events").array().notNull().default([]),

  // HMAC-SHA256 signing secret, returned once on creation (whsec_<hex>)
  secret: text("secret").notNull(),

  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),

  // Consecutive delivery failures — auto-disabled at 10
  failureCount: integer("failure_count").notNull().default(0),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── webhook_deliveries ────────────────────────────────────────────────────────
// Delivery log for each webhook POST attempt. Retained for 30 days.
// Auto-cascade on webhook deletion.
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id: serial("id").primaryKey(),
  webhookId: integer("webhook_id")
    .notNull()
    .references(() => webhooks.id, { onDelete: "cascade" }),

  eventType: text("event_type").notNull(),

  // Full event body sent to the endpoint
  payload: jsonb("payload").notNull(),

  // HTTP response from recipient (null = network error / timeout)
  statusCode: integer("status_code"),
  responseBody: text("response_body"),
  durationMs: integer("duration_ms"),

  success: boolean("success").notNull().default(false),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
});
