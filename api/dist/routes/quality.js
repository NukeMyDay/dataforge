// Data Quality Dashboard — GET /v1/quality
//
// Returns aggregate quality scores across all 6 Sophex data silos.
// Scores are computed by the quality-audit pipeline job (pipelines/src/lib/quality-audit.ts)
// and persisted in the record_quality_scores table.
//
// Quality score (0-100) = Completeness (40%) + Freshness (40%) + Source Authority (20%)
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
export const qualityRouter = new Hono();
// GET /v1/quality — quality dashboard (aggregated by silo)
qualityRouter.get("/", async (c) => {
    // Silo-level aggregates
    const siloRows = await db.execute(sql `
    SELECT
      silo,
      COUNT(*)::int                              AS record_count,
      ROUND(AVG(quality_score)::numeric, 1)      AS avg_quality,
      ROUND(AVG(completeness_score)::numeric, 1) AS avg_completeness,
      ROUND(AVG(freshness_score)::numeric, 1)    AS avg_freshness,
      MIN(quality_score)::float                  AS min_quality,
      MAX(quality_score)::float                  AS max_quality,
      MAX(computed_at)                           AS last_audit
    FROM record_quality_scores
    GROUP BY silo
    ORDER BY avg_quality DESC
  `);
    // Overall aggregate
    const [overall] = await db.execute(sql `
    SELECT
      COUNT(*)::int                              AS total_records,
      ROUND(AVG(quality_score)::numeric, 1)      AS overall_score,
      ROUND(AVG(completeness_score)::numeric, 1) AS completeness_avg,
      ROUND(AVG(freshness_score)::numeric, 1)    AS freshness_avg,
      MAX(computed_at)                           AS last_audit_at
    FROM record_quality_scores
  `);
    // Staleness distribution: age histogram across all silos
    const staleRows = await db.execute(sql `
    SELECT
      CASE
        WHEN (metadata->>'age_days')::numeric <  7   THEN '0-7d'
        WHEN (metadata->>'age_days')::numeric <  30  THEN '7-30d'
        WHEN (metadata->>'age_days')::numeric <  90  THEN '30-90d'
        WHEN (metadata->>'age_days')::numeric <  365 THEN '90-365d'
        ELSE '365+d'
      END AS bucket,
      COUNT(*)::int AS count
    FROM record_quality_scores
    WHERE metadata->>'age_days' IS NOT NULL
    GROUP BY bucket
    ORDER BY MIN((metadata->>'age_days')::numeric)
  `);
    // Staleness p50: median age in days across all records
    const [p50Row] = await db.execute(sql `
    SELECT
      PERCENTILE_CONT(0.5) WITHIN GROUP
        (ORDER BY (metadata->>'age_days')::numeric)::float AS p50_age_days
    FROM record_quality_scores
    WHERE metadata->>'age_days' IS NOT NULL
  `);
    // Duplicate candidates: records sharing a content_hash within a silo
    const [dupRow] = await db.execute(sql `
    SELECT COALESCE(SUM(dup_count), 0)::int AS total_duplicates
    FROM (
      SELECT silo, COUNT(*) - 1 AS dup_count
      FROM record_quality_scores
      WHERE metadata->>'filled_fields' IS NOT NULL
      GROUP BY silo, quality_score, completeness_score
      HAVING COUNT(*) > 1
    ) t
  `);
    const bySilo = {};
    for (const row of siloRows) {
        const key = String(row["silo"]);
        bySilo[key] = {
            recordCount: Number(row["record_count"] ?? 0),
            avgQuality: Number(row["avg_quality"] ?? 0),
            avgCompleteness: Number(row["avg_completeness"] ?? 0),
            avgFreshness: Number(row["avg_freshness"] ?? 0),
            minQuality: Number(row["min_quality"] ?? 0),
            maxQuality: Number(row["max_quality"] ?? 0),
            lastAudit: row["last_audit"],
        };
    }
    const stalenessHistogram = {};
    for (const row of staleRows) {
        stalenessHistogram[String(row["bucket"])] = Number(row["count"] ?? 0);
    }
    return c.json({
        data: {
            overallScore: Number(overall?.["overall_score"] ?? 0),
            totalRecords: Number(overall?.["total_records"] ?? 0),
            completenessAvg: Number(overall?.["completeness_avg"] ?? 0),
            freshnessAvg: Number(overall?.["freshness_avg"] ?? 0),
            staleness_p50_days: Number(p50Row?.["p50_age_days"] ?? 0),
            duplicateCandidates: Number(dupRow?.["total_duplicates"] ?? 0),
            lastAuditAt: overall?.["last_audit_at"] ?? null,
            bySilo,
            stalenessHistogram,
        },
        meta: {
            siloCount: siloRows.length,
            methodology: "Completeness 40% + Freshness 40% + Source Authority 20%",
        },
        error: null,
    });
});
// GET /v1/quality/:silo — per-silo quality details
qualityRouter.get("/:silo", async (c) => {
    const silo = c.req.param("silo");
    const records = await db.execute(sql `
    SELECT
      record_id,
      quality_score,
      completeness_score,
      freshness_score,
      source_authority_score,
      metadata,
      computed_at
    FROM record_quality_scores
    WHERE silo = ${silo}
    ORDER BY quality_score ASC
    LIMIT 100
  `);
    if (records.length === 0) {
        return c.json({ data: null, meta: { silo }, error: `No quality scores found for silo: ${silo}` }, 404);
    }
    const [agg] = await db.execute(sql `
    SELECT
      COUNT(*)::int                              AS record_count,
      ROUND(AVG(quality_score)::numeric, 1)      AS avg_quality,
      ROUND(AVG(completeness_score)::numeric, 1) AS avg_completeness,
      ROUND(AVG(freshness_score)::numeric, 1)    AS avg_freshness,
      MIN(quality_score)::float                  AS min_quality,
      MAX(quality_score)::float                  AS max_quality
    FROM record_quality_scores
    WHERE silo = ${silo}
  `);
    return c.json({
        data: {
            silo,
            summary: {
                recordCount: Number(agg?.["record_count"] ?? 0),
                avgQuality: Number(agg?.["avg_quality"] ?? 0),
                avgCompleteness: Number(agg?.["avg_completeness"] ?? 0),
                avgFreshness: Number(agg?.["avg_freshness"] ?? 0),
                minQuality: Number(agg?.["min_quality"] ?? 0),
                maxQuality: Number(agg?.["max_quality"] ?? 0),
            },
            // Lowest-scoring records (most actionable for data quality improvement)
            worstRecords: records.slice(0, 20).map((r) => ({
                recordId: r["record_id"],
                qualityScore: Number(r["quality_score"]),
                completenessScore: Number(r["completeness_score"]),
                freshnessScore: Number(r["freshness_score"]),
                sourceAuthorityScore: Number(r["source_authority_score"]),
                metadata: r["metadata"],
                computedAt: r["computed_at"],
            })),
        },
        meta: { silo, recordCount: records.length },
        error: null,
    });
});
//# sourceMappingURL=quality.js.map