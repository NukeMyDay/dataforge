import { boolean, integer, jsonb, pgTable, serial, text, timestamp, varchar, } from "drizzle-orm/pg-core";
import { pipelineRuns } from "./pipelines.js";
// ─── source_registry ──────────────────────────────────────────────────────────
// Formal authority documentation for each data source scraped by Sophex.
// One row per distinct source URL. Answers: "why is this source authoritative?"
export const sourceRegistry = pgTable("source_registry", {
    id: serial("id").primaryKey(),
    sourceUrl: text("source_url").notNull().unique(),
    // Authority metadata
    authorityName: varchar("authority_name", { length: 256 }).notNull(),
    authorityType: varchar("authority_type", { length: 64 }).notNull(), // federal | state | chamber | association
    legalBasis: text("legal_basis"),
    scraperName: varchar("scraper_name", { length: 128 }).notNull(),
    dataDomain: varchar("data_domain", { length: 128 }),
    notes: text("notes"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
// ─── scrape_integrity_log ──────────────────────────────────────────────────────
// One row per URL fetch. Records the raw HTTP-level evidence of what was
// received: headers, TLS cert info, body hash, and intermediary signals.
// Together with source_registry this forms the primary source verification layer.
export const scrapeIntegrityLog = pgTable("scrape_integrity_log", {
    id: serial("id").primaryKey(),
    sourceUrl: text("source_url").notNull(),
    scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
    // Cryptographic proof
    responseHash: varchar("response_hash", { length: 64 }), // SHA-256 of raw body
    // HTTP response metadata
    httpStatus: integer("http_status"),
    httpHeaders: jsonb("http_headers"), // { Date, Content-Type, Server, ETag }
    // TLS certificate chain
    tlsIssuer: text("tls_issuer"),
    tlsValidFrom: text("tls_valid_from"),
    tlsValidTo: text("tls_valid_to"),
    // Intermediary detection
    intermediaryFlags: jsonb("intermediary_flags"), // { Via, X-Cache, CF-Cache-Status, ... }
    hasIntermediary: boolean("has_intermediary").notNull().default(false),
    pipelineRunId: integer("pipeline_run_id").references(() => pipelineRuns.id, {
        onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
//# sourceMappingURL=source_verification.js.map