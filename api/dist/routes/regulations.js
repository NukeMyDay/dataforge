import { Hono } from "hono";
import { z } from "zod";
import { eq, and, or, ilike, asc, desc, count } from "drizzle-orm";
import { db, regulations, regulationChangelog } from "../db.js";
export const regulationsRouter = new Hono();
const listSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
    category: z.string().optional(),
    jurisdiction: z.string().optional(),
    q: z.string().optional(),
    sort: z.string().default("updatedAt:desc"),
});
regulationsRouter.get("/", async (c) => {
    const parsed = listSchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!parsed.success) {
        return c.json({ error: "Invalid query parameters", details: parsed.error.flatten() }, 400);
    }
    const { page, pageSize, category, jurisdiction, q, sort } = parsed.data;
    const conditions = [];
    if (category)
        conditions.push(eq(regulations.category, category));
    if (jurisdiction)
        conditions.push(eq(regulations.jurisdiction, jurisdiction));
    if (q) {
        const pattern = `%${q}%`;
        conditions.push(or(ilike(regulations.titleDe, pattern), ilike(regulations.titleEn, pattern), ilike(regulations.bodyDe, pattern), ilike(regulations.bodyEn, pattern)));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    const [sortField, sortDir] = sort.split(":");
    const sortColumn = sortField === "createdAt"
        ? regulations.createdAt
        : sortField === "effectiveDate"
            ? regulations.effectiveDate
            : regulations.updatedAt;
    const orderBy = sortDir === "asc" ? asc(sortColumn) : desc(sortColumn);
    const offset = (page - 1) * pageSize;
    const [rows, countRows] = await Promise.all([
        db.select().from(regulations).where(where).orderBy(orderBy).limit(pageSize).offset(offset),
        db.select({ total: count() }).from(regulations).where(where),
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    return c.json({
        data: rows,
        pagination: {
            page,
            pageSize,
            total,
            totalPages: Math.ceil(total / pageSize),
        },
    });
});
regulationsRouter.get("/:id", async (c) => {
    const idOrSlug = c.req.param("id");
    const isNumeric = /^\d+$/.test(idOrSlug);
    const condition = isNumeric ? eq(regulations.id, Number(idOrSlug)) : eq(regulations.slug, idOrSlug);
    const rows = await db.select().from(regulations).where(condition).limit(1);
    if (rows.length === 0 || !rows[0]) {
        return c.json({ error: "Not found" }, 404);
    }
    const regulation = rows[0];
    const changelog = await db
        .select()
        .from(regulationChangelog)
        .where(eq(regulationChangelog.regulationId, regulation.id))
        .orderBy(desc(regulationChangelog.version));
    return c.json({ data: { ...regulation, changelog } });
});
regulationsRouter.get("/:id/changelog", async (c) => {
    const idOrSlug = c.req.param("id");
    const isNumeric = /^\d+$/.test(idOrSlug);
    const condition = isNumeric ? eq(regulations.id, Number(idOrSlug)) : eq(regulations.slug, idOrSlug);
    const rows = await db.select({ id: regulations.id }).from(regulations).where(condition).limit(1);
    if (rows.length === 0 || !rows[0]) {
        return c.json({ error: "Not found" }, 404);
    }
    const changelog = await db
        .select()
        .from(regulationChangelog)
        .where(eq(regulationChangelog.regulationId, rows[0].id))
        .orderBy(desc(regulationChangelog.version));
    return c.json({ data: changelog });
});
//# sourceMappingURL=regulations.js.map