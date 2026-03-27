import { Hono } from "hono";
import { z } from "zod";
import { eq, and, or, ilike, asc, desc, count } from "drizzle-orm";
import { db, programs, institutions } from "../db.js";
import { requireJwt, requireAdmin } from "../middleware/jwt.js";
export const programsRouter = new Hono();
const listSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(50),
    country: z.string().optional(),
    degreeType: z.string().optional(),
    fieldOfStudy: z.string().optional(),
    language: z.string().optional(),
    institutionId: z.coerce.number().int().optional(),
    isActive: z.enum(["true", "false"]).optional(),
    q: z.string().optional(),
    sort: z.string().default("updatedAt:desc"),
});
programsRouter.get("/", async (c) => {
    const parsed = listSchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!parsed.success) {
        return c.json({ error: "Invalid query parameters", details: parsed.error.flatten() }, 400);
    }
    const { page, pageSize, country, degreeType, fieldOfStudy, language, institutionId, isActive, q, sort } = parsed.data;
    const conditions = [];
    if (country)
        conditions.push(eq(programs.country, country));
    if (degreeType)
        conditions.push(eq(programs.degreeType, degreeType));
    if (fieldOfStudy)
        conditions.push(eq(programs.fieldOfStudy, fieldOfStudy));
    if (language)
        conditions.push(eq(programs.language, language));
    if (institutionId)
        conditions.push(eq(programs.institutionId, institutionId));
    if (isActive !== undefined)
        conditions.push(eq(programs.isActive, isActive === "true"));
    if (q) {
        const pattern = `%${q}%`;
        conditions.push(or(ilike(programs.titleDe, pattern), ilike(programs.titleEn, pattern), ilike(programs.titleNl, pattern), ilike(programs.descriptionDe, pattern), ilike(programs.descriptionEn, pattern), ilike(programs.descriptionNl, pattern)));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;
    // Parse sort param (e.g. "updatedAt:desc")
    const [sortField, sortDir] = sort.split(":");
    const sortColumn = sortField === "createdAt"
        ? programs.createdAt
        : sortField === "titleEn"
            ? programs.titleEn
            : sortField === "titleDe"
                ? programs.titleDe
                : programs.updatedAt;
    const orderBy = sortDir === "asc" ? asc(sortColumn) : desc(sortColumn);
    const offset = (page - 1) * pageSize;
    const [rows, countRows] = await Promise.all([
        db.select().from(programs).where(where).orderBy(orderBy).limit(pageSize).offset(offset),
        db.select({ total: count() }).from(programs).where(where),
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
programsRouter.get("/:id", async (c) => {
    const idOrSlug = c.req.param("id");
    const isNumeric = /^\d+$/.test(idOrSlug);
    const condition = isNumeric ? eq(programs.id, Number(idOrSlug)) : eq(programs.slug, idOrSlug);
    const rows = await db
        .select()
        .from(programs)
        .innerJoin(institutions, eq(programs.institutionId, institutions.id))
        .where(condition)
        .limit(1);
    if (rows.length === 0 || !rows[0]) {
        return c.json({ error: "Not found" }, 404);
    }
    return c.json({ data: { ...rows[0].programs, institution: rows[0].institutions } });
});
// PATCH /v1/programs/:id — admin only; update is_active and/or title fields
programsRouter.patch("/:id", requireJwt, requireAdmin, async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) {
        return c.json({ data: null, meta: null, error: "Invalid program id" }, 400);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = z
        .object({
        isActive: z.boolean().optional(),
        titleEn: z.string().max(512).optional(),
        titleDe: z.string().max(512).optional(),
        titleNl: z.string().max(512).optional(),
    })
        .safeParse(body);
    if (!parsed.success) {
        return c.json({ data: null, meta: null, error: parsed.error.flatten() }, 400);
    }
    const { isActive, titleEn, titleDe, titleNl } = parsed.data;
    if (isActive === undefined && titleEn === undefined && titleDe === undefined && titleNl === undefined) {
        return c.json({ data: null, meta: null, error: "No fields to update" }, 400);
    }
    const set = { updatedAt: new Date() };
    if (isActive !== undefined)
        set.isActive = isActive;
    if (titleEn !== undefined)
        set.titleEn = titleEn;
    if (titleDe !== undefined)
        set.titleDe = titleDe;
    if (titleNl !== undefined)
        set.titleNl = titleNl;
    const [updated] = await db
        .update(programs)
        .set(set)
        .where(eq(programs.id, id))
        .returning();
    if (!updated) {
        return c.json({ data: null, meta: null, error: "Program not found" }, 404);
    }
    return c.json({ data: updated, meta: null, error: null });
});
//# sourceMappingURL=programs.js.map