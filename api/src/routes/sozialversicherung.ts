import { Hono } from "hono";
import { eq, asc, sql, or, ilike } from "drizzle-orm";
import { db, svContributionRates, svObligations } from "../db.js";

export const sozialversicherungRouter = new Hono();

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

// GET /v1/sozialversicherung/beitraege — current SV contribution rates (Beitragssätze)
sozialversicherungRouter.get("/sozialversicherung/beitraege", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, Number(c.req.query("pageSize") ?? PAGE_SIZE_DEFAULT)),
  );
  const offset = (page - 1) * pageSize;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(svContributionRates)
      .orderBy(asc(svContributionRates.insuranceType))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(svContributionRates),
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

// GET /v1/sozialversicherung/pflichten — employer obligations and Meldepflichten
// Optional query: appliesTo (filter by target group, e.g. "Arbeitgeber", "Selbstständige")
sozialversicherungRouter.get("/sozialversicherung/pflichten", async (c) => {
  const page = Math.max(1, Number(c.req.query("page") ?? 1));
  const pageSize = Math.min(
    PAGE_SIZE_MAX,
    Math.max(1, Number(c.req.query("pageSize") ?? PAGE_SIZE_DEFAULT)),
  );
  const offset = (page - 1) * pageSize;
  const appliesTo = c.req.query("appliesTo");

  const baseQuery = db.select().from(svObligations);
  const countQuery = db
    .select({ total: sql<number>`count(*)::int` })
    .from(svObligations);

  const [rows, countResult] = await Promise.all([
    (appliesTo
      ? baseQuery.where(ilike(svObligations.appliesTo, `%${appliesTo}%`))
      : baseQuery
    )
      .orderBy(asc(svObligations.obligationType))
      .limit(pageSize)
      .offset(offset),
    appliesTo
      ? countQuery.where(ilike(svObligations.appliesTo, `%${appliesTo}%`))
      : countQuery,
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

// GET /v1/sozialversicherung/minijob — Minijob rules and thresholds
// Returns all obligations and rates that specifically concern Minijob regulations.
sozialversicherungRouter.get("/sozialversicherung/minijob", async (c) => {
  const [rateRows, obligationRows] = await Promise.all([
    db
      .select()
      .from(svContributionRates)
      .where(
        ilike(svContributionRates.insuranceType, "minijob%"),
      )
      .orderBy(asc(svContributionRates.insuranceType)),
    db
      .select()
      .from(svObligations)
      .where(
        or(
          eq(svObligations.obligationType, "minijob_regelungen"),
          ilike(svObligations.appliesTo, "%minijobber%"),
        ),
      )
      .orderBy(asc(svObligations.obligationType)),
  ]);

  return c.json({
    data: {
      rates: rateRows,
      obligations: obligationRows,
    },
    meta: null,
    error: null,
  });
});
