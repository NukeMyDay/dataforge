import { Hono } from "hono";
import { z } from "zod";
import { eq, and, or, ilike, asc, desc, count, sql } from "drizzle-orm";
import { db, institutions, programs } from "../db.js";

export const institutionsRouter = new Hono();

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  country: z.string().optional(),
  type: z.string().optional(),
  q: z.string().optional(),
  sort: z.string().default("updatedAt:desc"),
});

institutionsRouter.get("/", async (c) => {
  const parsed = listSchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) {
    return c.json({ error: "Invalid query parameters", details: parsed.error.flatten() }, 400);
  }

  const { page, pageSize, country, type, q, sort } = parsed.data;

  const conditions = [];

  if (country) conditions.push(eq(institutions.country, country));
  if (type) conditions.push(eq(institutions.type, type));

  if (q) {
    const pattern = `%${q}%`;
    conditions.push(
      or(ilike(institutions.nameDe, pattern), ilike(institutions.nameEn, pattern), ilike(institutions.nameNl, pattern)),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [sortField, sortDir] = sort.split(":");
  const sortColumn =
    sortField === "createdAt"
      ? institutions.createdAt
      : sortField === "nameEn"
        ? institutions.nameEn
        : sortField === "nameDe"
          ? institutions.nameDe
          : institutions.updatedAt;
  const orderBy = sortDir === "asc" ? asc(sortColumn) : desc(sortColumn);

  const offset = (page - 1) * pageSize;

  const [rows, countRows] = await Promise.all([
    db.select().from(institutions).where(where).orderBy(orderBy).limit(pageSize).offset(offset),
    db.select({ total: count() }).from(institutions).where(where),
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

institutionsRouter.get("/:id", async (c) => {
  const idOrSlug = c.req.param("id");
  const isNumeric = /^\d+$/.test(idOrSlug);

  const condition = isNumeric ? eq(institutions.id, Number(idOrSlug)) : eq(institutions.slug, idOrSlug);

  const rows = await db
    .select({
      institution: institutions,
      programCount: sql<number>`cast(count(${programs.id}) as integer)`,
    })
    .from(institutions)
    .leftJoin(programs, eq(programs.institutionId, institutions.id))
    .where(condition)
    .groupBy(institutions.id)
    .limit(1);

  if (rows.length === 0 || !rows[0]) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ data: { ...rows[0].institution, programCount: rows[0].programCount } });
});
