import { Hono } from "hono";
import { eq, and, ilike, sql, desc } from "drizzle-orm";
import { db, fundingPrograms } from "../db.js";
export const fundingRouter = new Hono();
const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;
// GET /v1/funding — paginated list with filters
fundingRouter.get("/", async (c) => {
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(c.req.query("pageSize") ?? PAGE_SIZE_DEFAULT)));
    const offset = (page - 1) * pageSize;
    const region = c.req.query("region");
    const type = c.req.query("type");
    const targetGroup = c.req.query("target_group");
    const level = c.req.query("level");
    const state = c.req.query("state");
    const q = c.req.query("q");
    const conditions = [eq(fundingPrograms.isActive, true)];
    if (region)
        conditions.push(ilike(fundingPrograms.fundingRegion, `%${region}%`));
    if (type)
        conditions.push(ilike(fundingPrograms.fundingType, `%${type}%`));
    if (targetGroup)
        conditions.push(ilike(fundingPrograms.eligibleApplicants, `%${targetGroup}%`));
    if (level)
        conditions.push(eq(fundingPrograms.level, level));
    if (state)
        conditions.push(ilike(fundingPrograms.state, `%${state}%`));
    const where = and(...conditions);
    // Full-text search using pre-built tsvector, fall back to ilike on title if no FTS index yet
    const baseQuery = db
        .select({
        id: fundingPrograms.id,
        slug: fundingPrograms.slug,
        titleDe: fundingPrograms.titleDe,
        titleEn: fundingPrograms.titleEn,
        fundingType: fundingPrograms.fundingType,
        fundingArea: fundingPrograms.fundingArea,
        fundingRegion: fundingPrograms.fundingRegion,
        eligibleApplicants: fundingPrograms.eligibleApplicants,
        fundingAmountInfo: fundingPrograms.fundingAmountInfo,
        level: fundingPrograms.level,
        state: fundingPrograms.state,
        category: fundingPrograms.category,
        sourceUrl: fundingPrograms.sourceUrl,
        isActive: fundingPrograms.isActive,
        version: fundingPrograms.version,
        createdAt: fundingPrograms.createdAt,
        updatedAt: fundingPrograms.updatedAt,
    })
        .from(fundingPrograms)
        .where(q
        ? and(where, sql `search_vector @@ plainto_tsquery('german', ${q})`)
        : where)
        .orderBy(desc(fundingPrograms.updatedAt))
        .limit(pageSize)
        .offset(offset);
    const countQuery = db
        .select({ total: sql `count(*)::int` })
        .from(fundingPrograms)
        .where(q
        ? and(where, sql `search_vector @@ plainto_tsquery('german', ${q})`)
        : where);
    const [rows, countResult] = await Promise.all([baseQuery, countQuery]);
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
// GET /v1/funding/:id — detail by numeric id or slug
fundingRouter.get("/:id", async (c) => {
    const param = c.req.param("id");
    const numericId = Number(param);
    const rows = await db
        .select()
        .from(fundingPrograms)
        .where(Number.isInteger(numericId) && numericId > 0
        ? eq(fundingPrograms.id, numericId)
        : eq(fundingPrograms.slug, param))
        .limit(1);
    if (rows.length === 0) {
        return c.json({ data: null, meta: null, error: "Funding program not found" }, 404);
    }
    return c.json({ data: rows[0], meta: null, error: null });
});
//# sourceMappingURL=funding.js.map