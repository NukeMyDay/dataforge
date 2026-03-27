import { Hono } from "hono";
import { eq, asc, sql } from "drizzle-orm";
import { db, rechtsformen, gewerbeanmeldungInfo } from "../db.js";

export const rechtsformenRouter = new Hono();

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

// GET /v1/rechtsformen — list all German legal entity types with comparison fields
rechtsformenRouter.get("/rechtsformen", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, Number(c.req.query("pageSize") ?? PAGE_SIZE_DEFAULT)),
  );
  const offset = (page - 1) * pageSize;

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: rechtsformen.id,
        name: rechtsformen.name,
        slug: rechtsformen.slug,
        fullName: rechtsformen.fullName,
        minCapitalEur: rechtsformen.minCapitalEur,
        liabilityType: rechtsformen.liabilityType,
        notaryRequired: rechtsformen.notaryRequired,
        tradeRegisterRequired: rechtsformen.tradeRegisterRequired,
        founderCount: rechtsformen.founderCount,
        sourceUrl: rechtsformen.sourceUrl,
        scrapedAt: rechtsformen.scrapedAt,
        updatedAt: rechtsformen.updatedAt,
      })
      .from(rechtsformen)
      .orderBy(asc(rechtsformen.name))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(rechtsformen),
  ]);
  const countRows = countResult[0]?.total ?? 0;

  return c.json({
    data: rows,
    meta: {
      page,
      pageSize,
      total: countRows,
      totalPages: Math.ceil(countRows / pageSize),
    },
    error: null,
  });
});

// GET /v1/rechtsformen/:slug — detail for a specific Rechtsform
rechtsformenRouter.get("/rechtsformen/:slug", async (c) => {
  const slug = c.req.param("slug");

  const rows = await db
    .select()
    .from(rechtsformen)
    .where(eq(rechtsformen.slug, slug))
    .limit(1);

  if (rows.length === 0) {
    return c.json(
      { data: null, meta: null, error: "Rechtsform not found" },
      404,
    );
  }

  return c.json({ data: rows[0], meta: null, error: null });
});

// GET /v1/gewerbeanmeldung — list all Bundesland registration info
rechtsformenRouter.get("/gewerbeanmeldung", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, Number(c.req.query("pageSize") ?? PAGE_SIZE_DEFAULT)),
  );
  const offset = (page - 1) * pageSize;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(gewerbeanmeldungInfo)
      .orderBy(asc(gewerbeanmeldungInfo.bundesland))
      .limit(pageSize)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(gewerbeanmeldungInfo),
  ]);
  const countRows = countResult[0]?.total ?? 0;

  return c.json({
    data: rows,
    meta: {
      page,
      pageSize,
      total: countRows,
      totalPages: Math.ceil(countRows / pageSize),
    },
    error: null,
  });
});

// GET /v1/gewerbeanmeldung/:bundesland — detail for a specific Bundesland
rechtsformenRouter.get("/gewerbeanmeldung/:bundesland", async (c) => {
  const bundesland = decodeURIComponent(c.req.param("bundesland"));

  const rows = await db
    .select()
    .from(gewerbeanmeldungInfo)
    .where(eq(gewerbeanmeldungInfo.bundesland, bundesland))
    .limit(1);

  if (rows.length === 0) {
    return c.json(
      { data: null, meta: null, error: "Bundesland not found" },
      404,
    );
  }

  return c.json({ data: rows[0], meta: null, error: null });
});
