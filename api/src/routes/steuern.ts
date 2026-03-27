import { Hono } from "hono";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db, taxObligations, taxDeadlines } from "../db.js";

export const steuernRouter = new Hono();

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

// GET /v1/steuern — all tax obligations, optionally filtered by rechtsform
// Query params:
//   rechtsform: slug filter (e.g. "gmbh", "ug", "einzelunternehmen", "freiberufler", "gbr")
//               also returns rows with rechtsform_slug = "all" when a specific slug is given
//   taxType: exact match on tax_type
//   page, pageSize: pagination
steuernRouter.get("/steuern", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, Number(c.req.query("pageSize") ?? PAGE_SIZE_DEFAULT)),
  );
  const offset = (page - 1) * pageSize;
  const rechtsform = c.req.query("rechtsform");
  const taxType = c.req.query("taxType");

  // Build where clause
  const conditions = [];
  if (rechtsform) {
    // Return both the specific Rechtsform rows and the "all" rows
    conditions.push(
      or(
        eq(taxObligations.rechtsformSlug, rechtsform),
        eq(taxObligations.rechtsformSlug, "all"),
      ),
    );
  }
  if (taxType) {
    conditions.push(eq(taxObligations.taxType, taxType));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(taxObligations)
      .where(where)
      .orderBy(asc(taxObligations.rechtsformSlug), asc(taxObligations.taxType))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(taxObligations)
      .where(where),
  ]);
  const total = countResult[0]?.total ?? 0;

  return c.json({
    data: rows,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
    error: null,
  });
});

// GET /v1/steuern/rechtsform/:slug — tax obligations for a specific Rechtsform
// Returns both rows specific to the slug and universal rows (rechtsform_slug = "all")
steuernRouter.get("/steuern/rechtsform/:slug", async (c) => {
  const slug = c.req.param("slug");

  const rows = await db
    .select()
    .from(taxObligations)
    .where(
      or(
        eq(taxObligations.rechtsformSlug, slug),
        eq(taxObligations.rechtsformSlug, "all"),
      ),
    )
    .orderBy(asc(taxObligations.taxType));

  if (rows.length === 0) {
    return c.json(
      { data: null, meta: null, error: `No tax obligations found for Rechtsform: ${slug}` },
      404,
    );
  }

  return c.json({
    data: rows,
    meta: { rechtsformSlug: slug, total: rows.length },
    error: null,
  });
});

// GET /v1/steuern/kleinunternehmer — Kleinunternehmerregelung detail
// Convenience endpoint returning the § 19 UStG exemption record and its interaction
// with other tax types.
steuernRouter.get("/steuern/kleinunternehmer", async (c) => {
  const rows = await db
    .select()
    .from(taxObligations)
    .where(
      or(
        eq(taxObligations.taxType, "kleinunternehmerregelung"),
        eq(taxObligations.kleinunternehmerRelevant, true),
      ),
    )
    .orderBy(asc(taxObligations.taxType));

  return c.json({ data: rows, meta: { total: rows.length }, error: null });
});

// GET /v1/steuern/deadlines — key filing deadlines
// Query params:
//   taxType: filter by tax type (e.g. "umsatzsteuer", "einkommensteuer")
//   page, pageSize: pagination
steuernRouter.get("/steuern/deadlines", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, Number(c.req.query("pageSize") ?? PAGE_SIZE_DEFAULT)),
  );
  const offset = (page - 1) * pageSize;
  const taxType = c.req.query("taxType");

  const where = taxType ? eq(taxDeadlines.taxType, taxType) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(taxDeadlines)
      .where(where)
      .orderBy(asc(taxDeadlines.taxType), asc(taxDeadlines.eventTrigger))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(taxDeadlines)
      .where(where),
  ]);
  const total = countResult[0]?.total ?? 0;

  return c.json({
    data: rows,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
    error: null,
  });
});
