import { boolean, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const apiKeys = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  keyHash: varchar("key_hash", { length: 128 }).notNull().unique(),
  name: text("name"),
  // Legacy free-text owner field kept for backwards compat; userId is the FK for user-linked keys
  ownerId: text("owner_id"),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  tier: varchar("tier", { length: 32 }).notNull().default("free"),
  isActive: boolean("is_active").notNull().default(true),
  scopes: text("scopes").array().notNull().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  requestCount: integer("request_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
