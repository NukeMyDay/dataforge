// GET /v1/search — unified cross-silo search
// Currently searches funding programs via pg full-text search

import { Hono } from "hono";
import { sql, desc } from "drizzle-orm";
import { db, fundingPrograms } from "../db.js";

export const searchRouter = new Hono();

searchRouter.get("/", async (c: any) => {
  const q = c.req.query("q");
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit") ?? 10)));

  if (!q || q.trim().length === 0) {
    return c.json({ data: null, meta: null, error: "Missing query parameter q" }, 400);
  }

  const results = await db
    .select({
      id: fundingPrograms.id,
      slug: fundingPrograms.slug,
      title: fundingPrograms.titleDe,
      fundingType: fundingPrograms.fundingType,
      fundingArea: fundingPrograms.fundingArea,
      level: fundingPrograms.level,
      state: fundingPrograms.state,
      category: fundingPrograms.category,
      summaryDe: fundingPrograms.summaryDe,
      isActive: fundingPrograms.isActive,
      rank: sql`ts_rank(search_vector, plainto_tsquery('german', ${q}))`,
    })
    .from(fundingPrograms)
    .where(sql`search_vector @@ plainto_tsquery('german', ${q})`)
    .orderBy(desc(sql`ts_rank(search_vector, plainto_tsquery('german', ${q}))`))
    .limit(limit);

  return c.json({
    data: results.map(({ rank, ...item }: any) => item),
    meta: { query: q, total: results.length },
    error: null,
  });
});
