import { doublePrecision, integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
const sourceFingerprints = pgTable("source_fingerprints", {
  id: serial("id").primaryKey(),
  url: text("url").notNull().unique(),
  // HTTP cache headers from last HEAD request
  etag: text("etag"),
  lastModified: text("last_modified"),
  // SHA-256 of the parsed page content (post-scrape, not raw HTML)
  contentHash: varchar("content_hash", { length: 64 }),
  // When the URL was last probed and when content last actually changed
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
  // Change-frequency learning: used to derive optimal rescrape interval
  checkCount: integer("check_count").notNull().default(0),
  changeCount: integer("change_count").notNull().default(0),
  // Exponential moving average of hours between detected changes
  avgChangeIntervalHours: doublePrecision("avg_change_interval_hours"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});
export {
  sourceFingerprints
};
