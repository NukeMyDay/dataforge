import { index, integer, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex, } from "drizzle-orm/pg-core";
// ─── Record Quality Scores ─────────────────────────────────────────────────────
// Composite data quality score (0-100) per record across all 6 Sophex silos.
//
// Score = Completeness (40%) + Freshness (40%) + Source Authority (20%)
//
// Populated by the quality-audit pipeline job (pipelines/src/lib/quality-audit.ts).
// Queried by GET /v1/quality for the quality dashboard.
export const recordQualityScores = pgTable("record_quality_scores", {
    id: serial("id").primaryKey(),
    silo: text("silo").notNull(), // e.g. 'funding_programs', 'rechtsformen'
    recordId: integer("record_id").notNull(), // id in the source silo table
    // Dimension scores (0-100)
    completenessScore: numeric("completeness_score", { precision: 5, scale: 2 }).notNull().default("0"),
    freshnessScore: numeric("freshness_score", { precision: 5, scale: 2 }).notNull().default("0"),
    sourceAuthorityScore: numeric("source_authority_score", { precision: 5, scale: 2 }).notNull().default("80"),
    // Composite score: completeness*0.4 + freshness*0.4 + source_authority*0.2
    qualityScore: numeric("quality_score", { precision: 5, scale: 2 }).notNull().default("0"),
    // Per-record audit details (age_days, filled_fields, total_fields, etc.)
    metadata: jsonb("metadata").$type(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
    siloRecordUnique: uniqueIndex("idx_rqs_silo_record").on(t.silo, t.recordId),
    qualityIdx: index("idx_rqs_quality").on(t.qualityScore),
    siloIdx: index("idx_rqs_silo").on(t.silo),
}));
//# sourceMappingURL=data_quality.js.map