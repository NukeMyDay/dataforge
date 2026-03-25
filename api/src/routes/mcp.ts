import { Hono } from "hono";
import { eq, and, or, ilike, desc, count, sql } from "drizzle-orm";
import { db, programs, institutions, regulations, regulationChangelog } from "../db.js";

// Model Context Protocol endpoint — no API key required
export const mcpRouter = new Hono();

// JSON Schema definitions for each tool
const TOOLS = [
  {
    name: "search_programs",
    description: "Search accredited study programs by query, country, degree type, or language.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Full-text search query (title, description)" },
        country: { type: "string", description: "ISO 3166-1 alpha-2 country code, e.g. NL, DE" },
        degreeType: { type: "string", description: "Degree type, e.g. bachelor, master, phd" },
        language: { type: "string", description: "Language of instruction, e.g. nl, de, en" },
        limit: { type: "number", description: "Max results (1–200, default 50)" },
      },
    },
  },
  {
    name: "get_program",
    description: "Get a single study program with its institution by numeric id or slug.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Numeric program id" },
        slug: { type: "string", description: "Program slug" },
      },
    },
  },
  {
    name: "list_institutions",
    description: "List accredited institutions with program count, optionally filtered by country or type.",
    inputSchema: {
      type: "object",
      properties: {
        country: { type: "string", description: "ISO 3166-1 alpha-2 country code" },
        type: { type: "string", description: "Institution type, e.g. university, fachhochschule" },
        limit: { type: "number", description: "Max results (1–200, default 50)" },
      },
    },
  },
  {
    name: "search_regulations",
    description: "Search German regulatory requirements (e.g. NRW event permits) by query, category, or jurisdiction.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Full-text search query" },
        category: { type: "string", description: "Regulation category" },
        jurisdiction: { type: "string", description: "Jurisdiction identifier, e.g. NRW" },
      },
    },
  },
  {
    name: "get_regulation",
    description: "Get a single regulation with its full changelog by numeric id or slug.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "number", description: "Numeric regulation id" },
        slug: { type: "string", description: "Regulation slug" },
      },
    },
  },
];

// MCP error codes
const MCP_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

function mcpError(code: number, message: string) {
  return { error: { code, message } };
}

function mcpResult(data: unknown) {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

async function handleSearchPrograms(args: Record<string, unknown>) {
  const limit = Math.min(Math.max(Number(args["limit"] ?? 50), 1), 200);
  const conditions = [];

  if (args["country"]) conditions.push(eq(programs.country, String(args["country"])));
  if (args["degreeType"]) conditions.push(eq(programs.degreeType, String(args["degreeType"])));
  if (args["language"]) conditions.push(eq(programs.language, String(args["language"])));

  if (args["query"]) {
    const pattern = `%${args["query"]}%`;
    conditions.push(
      or(
        ilike(programs.titleDe, pattern),
        ilike(programs.titleEn, pattern),
        ilike(programs.titleNl, pattern),
        ilike(programs.descriptionDe, pattern),
        ilike(programs.descriptionEn, pattern),
        ilike(programs.descriptionNl, pattern),
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(programs)
    .innerJoin(institutions, eq(programs.institutionId, institutions.id))
    .where(where)
    .orderBy(desc(programs.updatedAt))
    .limit(limit);

  return rows.map((r) => ({ ...r.programs, institution: r.institutions }));
}

async function handleGetProgram(args: Record<string, unknown>) {
  if (args["id"] === undefined && args["slug"] === undefined) {
    return null;
  }

  const condition =
    args["id"] !== undefined
      ? eq(programs.id, Number(args["id"]))
      : eq(programs.slug, String(args["slug"]));

  const rows = await db
    .select()
    .from(programs)
    .innerJoin(institutions, eq(programs.institutionId, institutions.id))
    .where(condition)
    .limit(1);

  if (rows.length === 0 || !rows[0]) return null;
  return { ...rows[0].programs, institution: rows[0].institutions };
}

async function handleListInstitutions(args: Record<string, unknown>) {
  const limit = Math.min(Math.max(Number(args["limit"] ?? 50), 1), 200);
  const conditions = [];

  if (args["country"]) conditions.push(eq(institutions.country, String(args["country"])));
  if (args["type"]) conditions.push(eq(institutions.type, String(args["type"])));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select({
      institution: institutions,
      programCount: sql<number>`cast(count(${programs.id}) as integer)`,
    })
    .from(institutions)
    .leftJoin(programs, eq(programs.institutionId, institutions.id))
    .where(where)
    .groupBy(institutions.id)
    .orderBy(desc(institutions.updatedAt))
    .limit(limit);

  return rows.map((r) => ({ ...r.institution, programCount: r.programCount }));
}

async function handleSearchRegulations(args: Record<string, unknown>) {
  const conditions = [];

  if (args["category"]) conditions.push(eq(regulations.category, String(args["category"])));
  if (args["jurisdiction"]) conditions.push(eq(regulations.jurisdiction, String(args["jurisdiction"])));

  if (args["query"]) {
    const pattern = `%${args["query"]}%`;
    conditions.push(
      or(
        ilike(regulations.titleDe, pattern),
        ilike(regulations.titleEn, pattern),
        ilike(regulations.bodyDe, pattern),
        ilike(regulations.bodyEn, pattern),
      ),
    );
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  return db.select().from(regulations).where(where).orderBy(desc(regulations.updatedAt)).limit(50);
}

async function handleGetRegulation(args: Record<string, unknown>) {
  if (args["id"] === undefined && args["slug"] === undefined) {
    return null;
  }

  const condition =
    args["id"] !== undefined
      ? eq(regulations.id, Number(args["id"]))
      : eq(regulations.slug, String(args["slug"]));

  const rows = await db.select().from(regulations).where(condition).limit(1);

  if (rows.length === 0 || !rows[0]) return null;

  const regulation = rows[0];
  const changelog = await db
    .select()
    .from(regulationChangelog)
    .where(eq(regulationChangelog.regulationId, regulation.id))
    .orderBy(desc(regulationChangelog.version));

  return { ...regulation, changelog };
}

mcpRouter.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(mcpError(MCP_ERRORS.PARSE_ERROR, "Invalid JSON"), 400);
  }

  if (typeof body !== "object" || body === null || !("method" in body)) {
    return c.json(mcpError(MCP_ERRORS.INVALID_REQUEST, "Missing method"), 400);
  }

  const { method, params } = body as { method: string; params?: unknown };

  if (method === "tools/list") {
    return c.json({ tools: TOOLS });
  }

  if (method === "tools/call") {
    if (typeof params !== "object" || params === null) {
      return c.json(mcpError(MCP_ERRORS.INVALID_PARAMS, "Missing params"), 400);
    }

    const { name, arguments: args } = params as { name?: string; arguments?: Record<string, unknown> };

    if (!name) {
      return c.json(mcpError(MCP_ERRORS.INVALID_PARAMS, "Missing tool name"), 400);
    }

    const toolArgs = args ?? {};

    try {
      switch (name) {
        case "search_programs":
          return c.json(mcpResult(await handleSearchPrograms(toolArgs)));

        case "get_program": {
          const result = await handleGetProgram(toolArgs);
          if (!result) return c.json(mcpError(MCP_ERRORS.INVALID_PARAMS, "Program not found"), 404);
          return c.json(mcpResult(result));
        }

        case "list_institutions":
          return c.json(mcpResult(await handleListInstitutions(toolArgs)));

        case "search_regulations":
          return c.json(mcpResult(await handleSearchRegulations(toolArgs)));

        case "get_regulation": {
          const result = await handleGetRegulation(toolArgs);
          if (!result) return c.json(mcpError(MCP_ERRORS.INVALID_PARAMS, "Regulation not found"), 404);
          return c.json(mcpResult(result));
        }

        default:
          return c.json(mcpError(MCP_ERRORS.METHOD_NOT_FOUND, `Unknown tool: ${name}`), 404);
      }
    } catch (err) {
      console.error("MCP tool error:", err);
      return c.json(mcpError(MCP_ERRORS.INTERNAL_ERROR, "Internal error"), 500);
    }
  }

  return c.json(mcpError(MCP_ERRORS.METHOD_NOT_FOUND, `Unknown method: ${method}`), 404);
});
