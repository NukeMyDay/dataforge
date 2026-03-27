// Source Registry API — /v1/sources
//
// Lists all authoritative data sources scraped by Sophex, with full authority
// documentation: government body name, legal basis, and authority type.
// This is the "who" and "why" layer of primary source verification.

import { Hono } from "hono";
import { asc, desc, eq } from "drizzle-orm";
import { db, sourceRegistry, scrapeIntegrityLog } from "../db.js";

export const sourcesRouter = new Hono();

// GET /v1/sources — list all registered authoritative sources
sourcesRouter.get("/", async (c) => {
  const authorityType = c.req.query("authority_type"); // federal | state | chamber | association
  const dataDomain = c.req.query("domain");            // funding | rechtsformen | steuern | ...

  const rows = await db
    .select({
      id: sourceRegistry.id,
      sourceUrl: sourceRegistry.sourceUrl,
      authorityName: sourceRegistry.authorityName,
      authorityType: sourceRegistry.authorityType,
      legalBasis: sourceRegistry.legalBasis,
      scraperName: sourceRegistry.scraperName,
      dataDomain: sourceRegistry.dataDomain,
      notes: sourceRegistry.notes,
      verifiedAt: sourceRegistry.verifiedAt,
      createdAt: sourceRegistry.createdAt,
    })
    .from(sourceRegistry)
    .where(
      authorityType && dataDomain
        ? eq(sourceRegistry.authorityType, authorityType)
        : authorityType
          ? eq(sourceRegistry.authorityType, authorityType)
          : dataDomain
            ? eq(sourceRegistry.dataDomain, dataDomain)
            : undefined
    )
    .orderBy(asc(sourceRegistry.dataDomain), asc(sourceRegistry.authorityName));

  return c.json({
    data: rows,
    meta: { total: rows.length },
    error: null,
  });
});

// GET /v1/sources/:id — full authority documentation for a single source
sourcesRouter.get("/:id", async (c) => {
  const param = c.req.param("id");
  const numericId = Number(param);

  const rows = await db
    .select()
    .from(sourceRegistry)
    .where(Number.isInteger(numericId) && numericId > 0
      ? eq(sourceRegistry.id, numericId)
      : eq(sourceRegistry.sourceUrl, param))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ data: null, meta: null, error: "Source not found" }, 404);
  }

  const source = rows[0]!;

  // Fetch last 10 integrity log entries for this source
  const recentIntegrity = await db
    .select({
      id: scrapeIntegrityLog.id,
      scrapedAt: scrapeIntegrityLog.scrapedAt,
      responseHash: scrapeIntegrityLog.responseHash,
      httpStatus: scrapeIntegrityLog.httpStatus,
      tlsIssuer: scrapeIntegrityLog.tlsIssuer,
      hasIntermediary: scrapeIntegrityLog.hasIntermediary,
    })
    .from(scrapeIntegrityLog)
    .where(eq(scrapeIntegrityLog.sourceUrl, source.sourceUrl))
    .orderBy(desc(scrapeIntegrityLog.scrapedAt))
    .limit(10);

  return c.json({
    data: {
      ...source,
      recentIntegrity,
    },
    meta: null,
    error: null,
  });
});
