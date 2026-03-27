import { Hono } from "hono";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import { db, hrObligations, notaryCosts } from "../db.js";
export const handelsregisterRouter = new Hono();
const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;
// GET /v1/handelsregister/pflichten — registration obligations by Rechtsform
// Query params:
//   rechtsform: exact match on rechtsform_slug (e.g. "gmbh", "ug", "ag", "ohg", "kg", "gbr", "einzelunternehmen")
//               also returns rows with rechtsform_slug = "all" when a specific slug is given
//   obligationType: filter by type (e.g. "eintragungspflicht", "notarpflicht", "fristen", "publizitaetspflicht")
//   page, pageSize: pagination
handelsregisterRouter.get("/handelsregister/pflichten", async (c) => {
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(c.req.query("pageSize") ?? PAGE_SIZE_DEFAULT)));
    const offset = (page - 1) * pageSize;
    const rechtsform = c.req.query("rechtsform");
    const obligationType = c.req.query("obligationType");
    const conditions = [];
    if (rechtsform) {
        conditions.push(or(eq(hrObligations.rechtsformSlug, rechtsform), eq(hrObligations.rechtsformSlug, "all")));
    }
    if (obligationType) {
        conditions.push(eq(hrObligations.obligationType, obligationType));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [rows, countResult] = await Promise.all([
        db
            .select()
            .from(hrObligations)
            .where(where)
            .orderBy(asc(hrObligations.rechtsformSlug), asc(hrObligations.obligationType))
            .limit(pageSize)
            .offset(offset),
        db
            .select({ total: sql `count(*)::int` })
            .from(hrObligations)
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
// GET /v1/handelsregister/notar — notary requirements and cost examples
// Query params:
//   q: partial text search on label_de
//   page, pageSize: pagination
handelsregisterRouter.get("/handelsregister/notar", async (c) => {
    const page = Math.max(1, Number(c.req.query("page") ?? 1));
    const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(c.req.query("pageSize") ?? PAGE_SIZE_DEFAULT)));
    const offset = (page - 1) * pageSize;
    const q = c.req.query("q");
    const where = q ? ilike(notaryCosts.labelDe, `%${q}%`) : undefined;
    const [rows, countResult] = await Promise.all([
        db
            .select()
            .from(notaryCosts)
            .where(where)
            .orderBy(asc(notaryCosts.actType))
            .limit(pageSize)
            .offset(offset),
        db
            .select({ total: sql `count(*)::int` })
            .from(notaryCosts)
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
// GET /v1/handelsregister/notar/:actType — single notary cost record by act type
handelsregisterRouter.get("/handelsregister/notar/:actType", async (c) => {
    const actType = c.req.param("actType");
    const row = await db
        .select()
        .from(notaryCosts)
        .where(eq(notaryCosts.actType, actType))
        .limit(1);
    if (row.length === 0) {
        return c.json({ data: null, meta: null, error: `Notary cost not found: ${actType}` }, 404);
    }
    return c.json({ data: row[0], meta: null, error: null });
});
// GET /v1/handelsregister/ablauf/:rechtsform — step-by-step founding process
// Returns hr_obligations with obligation_type = "ablauf" for the given Rechtsform.
handelsregisterRouter.get("/handelsregister/ablauf/:rechtsform", async (c) => {
    const rechtsform = c.req.param("rechtsform");
    const rows = await db
        .select()
        .from(hrObligations)
        .where(and(or(eq(hrObligations.rechtsformSlug, rechtsform), eq(hrObligations.rechtsformSlug, "all")), eq(hrObligations.obligationType, "ablauf")))
        .orderBy(asc(hrObligations.rechtsformSlug));
    if (rows.length === 0) {
        return c.json({
            data: null,
            meta: null,
            error: `No founding process found for Rechtsform: ${rechtsform}`,
        }, 404);
    }
    return c.json({
        data: rows,
        meta: { rechtsformSlug: rechtsform, total: rows.length },
        error: null,
    });
});
//# sourceMappingURL=handelsregister.js.map