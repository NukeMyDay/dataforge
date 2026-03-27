// GET /v1/search — unified cross-silo search across programs, institutions, regulations
// Public (no API key required) — uses pg_tsvector full-text search
import { Hono } from "hono";
import { z } from "zod";
import { and, eq, sql, desc } from "drizzle-orm";
import { db, programs, institutions, regulations } from "../db.js";
export const searchRouter = new Hono();
const querySchema = z.object({
    q: z.string().min(1).max(200),
    silo: z.enum(["all", "programs", "institutions", "regulations"]).default("all"),
    country: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(10),
});
searchRouter.get("/", async (c) => {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
    if (!parsed.success) {
        return c.json({ data: null, meta: null, error: "Invalid query" }, 400);
    }
    const { q, silo, country, limit } = parsed.data;
    const [programResults, institutionResults, regulationResults] = await Promise.all([
        // Programs
        (silo === "all" || silo === "programs")
            ? db
                .select({
                id: programs.id,
                slug: programs.slug,
                title: sql `coalesce(${programs.titleEn}, ${programs.titleNl}, ${programs.titleDe})`,
                subtitle: sql `coalesce(${programs.degreeType}, '')`,
                country: programs.country,
                type: sql `'program'`,
                rank: sql `ts_rank(programs.search_vector, plainto_tsquery('simple', ${q}))`,
            })
                .from(programs)
                .where(and(sql `programs.search_vector @@ plainto_tsquery('simple', ${q})`, country ? eq(programs.country, country) : undefined))
                .orderBy(desc(sql `ts_rank(programs.search_vector, plainto_tsquery('simple', ${q}))`))
                .limit(limit)
            : Promise.resolve([]),
        // Institutions
        (silo === "all" || silo === "institutions")
            ? db
                .select({
                id: institutions.id,
                slug: institutions.slug,
                title: sql `coalesce(${institutions.nameEn}, ${institutions.nameNl}, ${institutions.nameDe})`,
                subtitle: sql `coalesce(${institutions.city}, '')`,
                country: institutions.country,
                type: sql `'institution'`,
                rank: sql `ts_rank(institutions.search_vector, plainto_tsquery('simple', ${q}))`,
            })
                .from(institutions)
                .where(and(sql `institutions.search_vector @@ plainto_tsquery('simple', ${q})`, country ? eq(institutions.country, country) : undefined))
                .orderBy(desc(sql `ts_rank(institutions.search_vector, plainto_tsquery('simple', ${q}))`))
                .limit(limit)
            : Promise.resolve([]),
        // Regulations
        (silo === "all" || silo === "regulations")
            ? db
                .select({
                id: regulations.id,
                slug: regulations.slug,
                title: sql `coalesce(${regulations.titleEn}, ${regulations.titleDe})`,
                subtitle: sql `coalesce(${regulations.jurisdiction}, '')`,
                country: sql `'DE'`,
                type: sql `'regulation'`,
                rank: sql `ts_rank(regulations.search_vector, plainto_tsquery('simple', ${q}))`,
            })
                .from(regulations)
                .where(sql `regulations.search_vector @@ plainto_tsquery('simple', ${q})`)
                .orderBy(desc(sql `ts_rank(regulations.search_vector, plainto_tsquery('simple', ${q}))`))
                .limit(limit)
            : Promise.resolve([]),
    ]);
    // Merge and re-rank by ts_rank score
    const all = [...programResults, ...institutionResults, ...regulationResults]
        .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
        .slice(0, silo === "all" ? limit * 2 : limit)
        .map(({ rank: _rank, ...item }) => item); // strip internal rank
    return c.json({
        data: all,
        meta: {
            query: q,
            total: all.length,
            programs: programResults.length,
            institutions: institutionResults.length,
            regulations: regulationResults.length,
        },
        error: null,
    });
});
//# sourceMappingURL=search.js.map