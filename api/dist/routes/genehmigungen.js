import { Hono } from "hono";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import { db, permits, berufsgenossenschaften } from "../db.js";
export const genehmigungenRouter = new Hono();
const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;
// GET /v1/genehmigungen — list of permits, filterable by trade_category and permit_category
// Query params:
//   tradeCategory: exact match on trade_category
//   permitCategory: exact match on permit_category
//                   (e.g. "erlaubnispflichtiges_gewerbe", "meisterpflicht", "konzession")
//   q: partial text search on label_de
//   page, pageSize: pagination
genehmigungenRouter.get("/genehmigungen", async (c) => {
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(c.req.query("pageSize") ?? PAGE_SIZE_DEFAULT)));
    const offset = (page - 1) * pageSize;
    const tradeCategory = c.req.query("tradeCategory");
    const permitCategory = c.req.query("permitCategory");
    const q = c.req.query("q");
    const conditions = [];
    if (tradeCategory)
        conditions.push(eq(permits.tradeCategory, tradeCategory));
    if (permitCategory)
        conditions.push(eq(permits.permitCategory, permitCategory));
    if (q)
        conditions.push(ilike(permits.labelDe, `%${q}%`));
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [rows, countResult] = await Promise.all([
        db
            .select()
            .from(permits)
            .where(where)
            .orderBy(asc(permits.permitCategory), asc(permits.tradeCategory), asc(permits.permitKey))
            .limit(pageSize)
            .offset(offset),
        db
            .select({ total: sql `count(*)::int` })
            .from(permits)
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
// GET /v1/genehmigungen/:id — single permit by numeric id or permit_key
genehmigungenRouter.get("/genehmigungen/:id", async (c) => {
    const idOrKey = c.req.param("id");
    const numericId = Number(idOrKey);
    const row = await db
        .select()
        .from(permits)
        .where(Number.isNaN(numericId)
        ? eq(permits.permitKey, idOrKey)
        : eq(permits.id, numericId))
        .limit(1);
    if (row.length === 0) {
        return c.json({ data: null, meta: null, error: `Permit not found: ${idOrKey}` }, 404);
    }
    return c.json({ data: row[0], meta: null, error: null });
});
// GET /v1/berufsgenossenschaften — list of BGs by sector
// Query params:
//   q: partial text search on name or sectors
//   page, pageSize: pagination
genehmigungenRouter.get("/berufsgenossenschaften", async (c) => {
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(c.req.query("pageSize") ?? PAGE_SIZE_DEFAULT)));
    const offset = (page - 1) * pageSize;
    const q = c.req.query("q");
    const where = q
        ? ilike(berufsgenossenschaften.sectorDescription, `%${q}%`)
        : undefined;
    const [rows, countResult] = await Promise.all([
        db
            .select()
            .from(berufsgenossenschaften)
            .where(where)
            .orderBy(asc(berufsgenossenschaften.shortName))
            .limit(pageSize)
            .offset(offset),
        db
            .select({ total: sql `count(*)::int` })
            .from(berufsgenossenschaften)
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
//# sourceMappingURL=genehmigungen.js.map