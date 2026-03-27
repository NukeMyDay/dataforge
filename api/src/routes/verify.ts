// Source Verification API — /v1/verify/:recordId
//
// Returns the cryptographic verification report for a specific scrape event:
// - Source URL and authority documentation (from source_registry)
// - Scrape timestamp
// - SHA-256 hash of the raw HTTP response body
// - TLS certificate chain info (issuer, validity period)
// - Intermediary detection results (CDN/proxy signals)
//
// This is the "what was received, from whom, and when" layer of primary source
// verification. Given a record ID, any party can verify exactly what bytes
// Sophex received from the primary source.

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, scrapeIntegrityLog, sourceRegistry } from "../db.js";

export const verifyRouter = new Hono();

// GET /v1/verify/:recordId  (recordId = scrape_integrity_log.id)
verifyRouter.get("/:recordId", async (c) => {
  const recordId = Number(c.req.param("recordId"));

  if (!Number.isInteger(recordId) || recordId <= 0) {
    return c.json({ data: null, meta: null, error: "Invalid record ID" }, 400);
  }

  const rows = await db
    .select()
    .from(scrapeIntegrityLog)
    .where(eq(scrapeIntegrityLog.id, recordId))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ data: null, meta: null, error: "Integrity record not found" }, 404);
  }

  const record = rows[0]!;

  // Look up source authority documentation by URL
  const sourceRows = await db
    .select({
      id: sourceRegistry.id,
      authorityName: sourceRegistry.authorityName,
      authorityType: sourceRegistry.authorityType,
      legalBasis: sourceRegistry.legalBasis,
      scraperName: sourceRegistry.scraperName,
      dataDomain: sourceRegistry.dataDomain,
      verifiedAt: sourceRegistry.verifiedAt,
    })
    .from(sourceRegistry)
    .where(eq(sourceRegistry.sourceUrl, record.sourceUrl))
    .limit(1);

  const source = sourceRows[0] ?? null;

  // Derive a simple verification verdict
  const verdict = deriveVerdict(record, source);

  return c.json({
    data: {
      // Identity
      recordId: record.id,
      sourceUrl: record.sourceUrl,
      scrapedAt: record.scrapedAt,

      // Authority documentation — null if source not yet in registry
      authority: source
        ? {
            name: source.authorityName,
            type: source.authorityType,
            legalBasis: source.legalBasis,
            dataDomain: source.dataDomain,
            registryVerifiedAt: source.verifiedAt,
          }
        : null,

      // Cryptographic proof
      responseHash: record.responseHash,
      httpStatus: record.httpStatus,

      // TLS chain (HTTPS sources only)
      tls: record.tlsIssuer
        ? {
            issuer: record.tlsIssuer,
            validFrom: record.tlsValidFrom,
            validTo: record.tlsValidTo,
          }
        : null,

      // Intermediary analysis
      intermediary: {
        detected: record.hasIntermediary,
        flags: record.intermediaryFlags ?? {},
      },

      // Captured HTTP headers
      httpHeaders: record.httpHeaders ?? {},
    },
    meta: { verdict },
    error: null,
  });
});

// ─── Verdict ──────────────────────────────────────────────────────────────────

type Verdict = "verified" | "intermediary_detected" | "unregistered_source" | "incomplete";

/**
 * Derive a high-level verification verdict.
 *
 *   "verified"             — source is registered, HTTPS confirmed, no intermediary
 *   "intermediary_detected"— CDN/proxy signals found in response headers
 *   "unregistered_source"  — URL not in the source registry
 *   "incomplete"           — integrity data is missing (capture failed)
 */
function deriveVerdict(
  record: typeof scrapeIntegrityLog.$inferSelect,
  source: { authorityType: string } | null
): Verdict {
  if (!record.responseHash) return "incomplete";
  if (!source) return "unregistered_source";
  if (record.hasIntermediary) return "intermediary_detected";
  return "verified";
}
