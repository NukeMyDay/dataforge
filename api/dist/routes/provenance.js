// Audit-trail endpoint: /v1/provenance/:sourceId
//
// Returns the full provenance record for a funding program: source URL,
// version history with per-version content hashes and scrape run links,
// source fingerprint (ETag / Last-Modified history), and a confidence score.
import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { db, fundingPrograms, fundingChangelog, sourceFingerprints } from "../db.js";
export const provenanceRouter = new Hono();
/**
 * Compute a 0–100 confidence score for a funding record.
 *
 * Three components:
 *   Freshness   (0–40): how recently was the record scraped?
 *   Stability   (0–40): how often does the source content change?
 *   Source      (0–20): is the source an authoritative primary source?
 */
function computeConfidence(p) {
    // Freshness score
    let freshness = 5; // default: never scraped or very stale
    if (p.lastScrapedAt) {
        const days = (Date.now() - p.lastScrapedAt.getTime()) / 86_400_000;
        if (days <= 7)
            freshness = 40;
        else if (days <= 14)
            freshness = 35;
        else if (days <= 30)
            freshness = 25;
        else if (days <= 90)
            freshness = 15;
    }
    // Stability score: low change rate → high confidence current data is accurate
    let stability = 20; // default: unknown (not enough checks)
    if (p.checkCount > 2) {
        const rate = p.changeCount / p.checkCount;
        if (rate < 0.05)
            stability = 40; // < 5% of checks showed a change
        else if (rate < 0.2)
            stability = 30; // < 20%
        else if (rate < 0.5)
            stability = 20; // < 50%
        else
            stability = 10; // frequently changing source
    }
    // Source reliability score
    let source = 10;
    if (p.sourceUrl.includes("foerderdatenbank.de"))
        source = 20; // official German government portal
    return freshness + stability + source;
}
// ─── Route ────────────────────────────────────────────────────────────────────
// GET /v1/provenance/:sourceId  (sourceId = numeric id or slug)
provenanceRouter.get("/:sourceId", async (c) => {
    const param = c.req.param("sourceId");
    const numericId = Number(param);
    const rows = await db
        .select({
        id: fundingPrograms.id,
        slug: fundingPrograms.slug,
        titleDe: fundingPrograms.titleDe,
        sourceUrl: fundingPrograms.sourceUrl,
        version: fundingPrograms.version,
        contentHash: fundingPrograms.contentHash,
        lastScrapedAt: fundingPrograms.lastScrapedAt,
        createdAt: fundingPrograms.createdAt,
        updatedAt: fundingPrograms.updatedAt,
    })
        .from(fundingPrograms)
        .where(Number.isInteger(numericId) && numericId > 0
        ? eq(fundingPrograms.id, numericId)
        : eq(fundingPrograms.slug, param))
        .limit(1);
    if (rows.length === 0) {
        return c.json({ data: null, meta: null, error: "Funding program not found" }, 404);
    }
    const program = rows[0];
    // Full version history with provenance metadata
    const trail = await db
        .select({
        version: fundingChangelog.version,
        contentHash: fundingChangelog.contentHash,
        changesDe: fundingChangelog.changesDe,
        changesEn: fundingChangelog.changesEn,
        scrapeRunId: fundingChangelog.scrapeRunId,
        changedAt: fundingChangelog.changedAt,
    })
        .from(fundingChangelog)
        .where(eq(fundingChangelog.fundingProgramId, program.id))
        .orderBy(desc(fundingChangelog.version));
    // Source fingerprint: ETag/Last-Modified state and change-frequency model
    const fps = await db
        .select()
        .from(sourceFingerprints)
        .where(eq(sourceFingerprints.url, program.sourceUrl))
        .limit(1);
    const fp = fps[0] ?? null;
    const confidence = computeConfidence({
        lastScrapedAt: program.lastScrapedAt,
        checkCount: fp?.checkCount ?? 0,
        changeCount: fp?.changeCount ?? 0,
        sourceUrl: program.sourceUrl,
    });
    return c.json({
        data: {
            id: program.id,
            slug: program.slug,
            titleDe: program.titleDe,
            sourceUrl: program.sourceUrl,
            currentVersion: program.version,
            currentContentHash: program.contentHash,
            lastScrapedAt: program.lastScrapedAt,
            createdAt: program.createdAt,
            updatedAt: program.updatedAt,
            // Chronological version trail — each entry links to the scrape run
            trail,
            // HTTP-level fingerprint used for skip-if-unchanged optimisation
            fingerprint: fp
                ? {
                    etag: fp.etag,
                    lastModified: fp.lastModified,
                    lastCheckedAt: fp.lastCheckedAt,
                    lastChangedAt: fp.lastChangedAt,
                    checkCount: fp.checkCount,
                    changeCount: fp.changeCount,
                    avgChangeIntervalHours: fp.avgChangeIntervalHours,
                }
                : null,
        },
        meta: { confidence },
        error: null,
    });
});
//# sourceMappingURL=provenance.js.map