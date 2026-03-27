// POST /v1/assistant — Sophex Startup Assistant agentic endpoint
// Anonymous (no API key required). Rate-limited to 10 req/min per IP.
// Uses Claude claude-sonnet-4-6 with 8 Drizzle-backed tool handlers.

import { Hono } from "hono";
import { z } from "zod";
import { asc, eq, ilike, or, sql, and } from "drizzle-orm";
import {
  db,
  rechtsformen,
  gewerbeanmeldungInfo,
  taxObligations,
  taxDeadlines,
  permits,
  berufsgenossenschaften,
  svContributionRates,
  svObligations,
  hrObligations,
  notaryCosts,
  fundingPrograms,
} from "../db.js";

export const assistantRouter = new Hono();

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ASSISTANT_MODEL = "claude-sonnet-4-6";
const MAX_ITERATIONS = 5;
// Rough upper bound: 2000 tokens ≈ 8000 characters
const MAX_INPUT_CHARS = 8000;

const SYSTEM_PROMPT = `You are Sophex Startup Assistant, an AI guide for German founders.
You help founders navigate the German founding process step by step.
Always answer in German unless the user writes in English.
When you cite data, always include the official source URL from the data record.
Use the provided tools to fetch current, authoritative Sophex data before answering.
Format answers with clear headings and bullet points.
End every answer with: "Nächster Schritt: ..."`;

// ─── In-memory rate limiter (10 req/min per IP) ───────────────────────────────

interface RateEntry {
  count: number;
  resetAt: number; // unix ms
}

const ipRateStore = new Map<string, RateEntry>();
const ASSISTANT_RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let entry = ipRateStore.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + RATE_WINDOW_MS };
  }
  entry.count += 1;
  ipRateStore.set(ip, entry);
  return entry.count <= ASSISTANT_RATE_LIMIT;
}

// ─── Request schema ────────────────────────────────────────────────────────────

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1),
});

const requestSchema = z.object({
  messages: z.array(messageSchema).min(1),
  context: z
    .object({
      bundesland: z.string().optional(),
      rechtsform: z.string().optional(),
    })
    .optional(),
});

// ─── Tool definitions (Anthropic format) ──────────────────────────────────────

const TOOLS = [
  {
    name: "get_rechtsformen",
    description:
      "Fetch German legal entity types (Rechtsformen) from the database. Returns comparison data including minimum capital, liability type, notary requirements, and founding costs.",
    input_schema: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Optional: filter by slug (e.g. 'gmbh', 'ug', 'gbr'). Omit for all.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_steuern",
    description:
      "Fetch German tax obligations (Steuerliche Pflichten) and filing deadlines for founders. Can filter by Rechtsform slug.",
    input_schema: {
      type: "object",
      properties: {
        rechtsformSlug: {
          type: "string",
          description: "Optional: filter by Rechtsform slug (e.g. 'gmbh', 'einzelunternehmen').",
        },
        includeDeadlines: {
          type: "boolean",
          description: "Whether to also return filing deadlines (Steuerfristen). Default: true.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_gewerbeanmeldung",
    description:
      "Fetch business registration (Gewerbeanmeldung) requirements per Bundesland: costs, processing time, required documents, and online availability.",
    input_schema: {
      type: "object",
      properties: {
        bundesland: {
          type: "string",
          description: "Optional: filter by Bundesland name (e.g. 'Bayern', 'Berlin').",
        },
      },
      required: [],
    },
  },
  {
    name: "get_genehmigungen",
    description:
      "Fetch required permits and licences (Genehmigungen) for specific trades, plus Berufsgenossenschaft (statutory accident insurance) information.",
    input_schema: {
      type: "object",
      properties: {
        tradeCategory: {
          type: "string",
          description: "Optional: trade sector filter (e.g. 'gastronomie_tourismus', 'handwerk_bau').",
        },
        permitCategory: {
          type: "string",
          description:
            "Optional: permit category filter (e.g. 'erlaubnispflichtiges_gewerbe', 'meisterpflicht').",
        },
        query: {
          type: "string",
          description: "Optional: text search in permit label.",
        },
        includeBG: {
          type: "boolean",
          description: "Whether to also return Berufsgenossenschaft data. Default: true.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_sozialversicherung",
    description:
      "Fetch social insurance contribution rates (Beitragssätze) and employer obligations (Meldepflichten) for German founders hiring employees.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_handelsregister",
    description:
      "Fetch trade register (Handelsregister) obligations and notary costs for different Rechtsformen.",
    input_schema: {
      type: "object",
      properties: {
        rechtsformSlug: {
          type: "string",
          description:
            "Optional: filter by Rechtsform slug (e.g. 'gmbh', 'ag'). Omit for all.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_foerderprogramme",
    description:
      "Search and filter German funding programs (Förderprogramme) for startups: grants, loans, and guarantees from federal, state, and EU sources.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Full-text search term.",
        },
        level: {
          type: "string",
          enum: ["bund", "land", "eu"],
          description: "Funding level filter.",
        },
        state: {
          type: "string",
          description: "Bundesland filter for land-level programs.",
        },
        fundingType: {
          type: "string",
          description: "Funding type filter (e.g. 'Zuschuss', 'Darlehen').",
        },
      },
      required: [],
    },
  },
  {
    name: "search_sophex",
    description:
      "Cross-silo full-text search across all Sophex data: Rechtsformen, taxes, permits, social insurance, Handelsregister, and funding programs.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query.",
        },
      },
      required: ["query"],
    },
  },
];

// ─── Tool handler implementations ─────────────────────────────────────────────

interface ToolResult {
  data: unknown;
  sources: Array<{ label: string; url: string }>;
}

async function handleGetRechtsformen(input: { slug?: string }): Promise<ToolResult> {
  const rows = input.slug
    ? await db.select().from(rechtsformen).where(eq(rechtsformen.slug, input.slug)).limit(5)
    : await db.select().from(rechtsformen).orderBy(asc(rechtsformen.name)).limit(20);

  const sources = rows
    .filter((r) => r.sourceUrl)
    .map((r) => ({ label: r.name, url: r.sourceUrl! }));

  return { data: rows, sources };
}

async function handleGetSteuern(input: {
  rechtsformSlug?: string;
  includeDeadlines?: boolean;
}): Promise<ToolResult> {
  const includeDeadlines = input.includeDeadlines !== false;
  const slug = input.rechtsformSlug;

  const whereObligations = slug
    ? or(eq(taxObligations.rechtsformSlug, slug), eq(taxObligations.rechtsformSlug, "all"))
    : undefined;

  const [obligations, deadlines] = await Promise.all([
    db.select().from(taxObligations).where(whereObligations).orderBy(asc(taxObligations.taxType)).limit(50),
    includeDeadlines
      ? db.select().from(taxDeadlines).orderBy(asc(taxDeadlines.taxType)).limit(30)
      : Promise.resolve([]),
  ]);

  const allRows = [...obligations, ...deadlines];
  const sources: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();
  for (const r of allRows) {
    if (r.sourceUrl && !seen.has(r.sourceUrl)) {
      seen.add(r.sourceUrl);
      const label = "taxType" in r ? String(r.taxType) : "Steuerfristen";
      sources.push({ label, url: r.sourceUrl });
    }
  }

  return { data: { obligations, deadlines }, sources };
}

async function handleGetGewerbeanmeldung(input: { bundesland?: string }): Promise<ToolResult> {
  const rows = input.bundesland
    ? await db
        .select()
        .from(gewerbeanmeldungInfo)
        .where(ilike(gewerbeanmeldungInfo.bundesland, `%${input.bundesland}%`))
        .limit(5)
    : await db
        .select()
        .from(gewerbeanmeldungInfo)
        .orderBy(asc(gewerbeanmeldungInfo.bundesland))
        .limit(20);

  const sources = rows
    .filter((r) => r.sourceUrl)
    .map((r) => ({ label: r.bundesland, url: r.sourceUrl! }));

  return { data: rows, sources };
}

async function handleGetGenehmigungen(input: {
  tradeCategory?: string;
  permitCategory?: string;
  query?: string;
  includeBG?: boolean;
}): Promise<ToolResult> {
  const includeBG = input.includeBG !== false;
  const conditions = [];
  if (input.tradeCategory) conditions.push(eq(permits.tradeCategory, input.tradeCategory));
  if (input.permitCategory) conditions.push(eq(permits.permitCategory, input.permitCategory));
  if (input.query) conditions.push(ilike(permits.labelDe, `%${input.query}%`));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [permitRows, bgRows] = await Promise.all([
    db.select().from(permits).where(where).orderBy(asc(permits.permitCategory)).limit(30),
    includeBG
      ? db.select().from(berufsgenossenschaften).orderBy(asc(berufsgenossenschaften.name)).limit(20)
      : Promise.resolve([]),
  ]);

  const sources: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();
  for (const r of [...permitRows, ...bgRows]) {
    if (r.sourceUrl && !seen.has(r.sourceUrl)) {
      seen.add(r.sourceUrl);
      sources.push({ label: "name" in r ? String(r.name) : String(r.permitType ?? r.permitKey), url: r.sourceUrl });
    }
  }

  return { data: { permits: permitRows, berufsgenossenschaften: bgRows }, sources };
}

async function handleGetSozialversicherung(): Promise<ToolResult> {
  const [rates, obligations] = await Promise.all([
    db.select().from(svContributionRates).orderBy(asc(svContributionRates.insuranceType)).limit(20),
    db.select().from(svObligations).limit(30),
  ]);

  const sources: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();
  for (const r of rates) {
    if (r.sourceUrl && !seen.has(r.sourceUrl)) {
      seen.add(r.sourceUrl);
      sources.push({ label: r.labelDe ?? r.insuranceType, url: r.sourceUrl });
    }
  }
  for (const r of obligations) {
    if (r.sourceUrl && !seen.has(r.sourceUrl)) {
      seen.add(r.sourceUrl);
      sources.push({ label: r.labelDe ?? r.obligationType, url: r.sourceUrl });
    }
  }

  return { data: { contributionRates: rates, obligations }, sources };
}

async function handleGetHandelsregister(input: { rechtsformSlug?: string }): Promise<ToolResult> {
  const where = input.rechtsformSlug
    ? or(
        eq(hrObligations.rechtsformSlug, input.rechtsformSlug),
        eq(hrObligations.rechtsformSlug, "all"),
      )
    : undefined;

  const [obligations, costs] = await Promise.all([
    db.select().from(hrObligations).where(where).orderBy(asc(hrObligations.obligationType)).limit(30),
    db.select().from(notaryCosts).limit(20),
  ]);

  const sources: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();
  for (const r of [...obligations, ...costs]) {
    if (r.sourceUrl && !seen.has(r.sourceUrl)) {
      seen.add(r.sourceUrl);
      sources.push({ label: r.labelDe ?? "Handelsregister", url: r.sourceUrl });
    }
  }

  return { data: { obligations, notaryCosts: costs }, sources };
}

async function handleGetFoerderprogramme(input: {
  query?: string;
  level?: string;
  state?: string;
  fundingType?: string;
}): Promise<ToolResult> {
  const conditions = [eq(fundingPrograms.isActive, true)];
  if (input.level) conditions.push(eq(fundingPrograms.level, input.level));
  if (input.state) conditions.push(ilike(fundingPrograms.state, `%${input.state}%`));
  if (input.fundingType) conditions.push(ilike(fundingPrograms.fundingType, `%${input.fundingType}%`));

  const where = input.query
    ? and(...conditions, sql`search_vector @@ plainto_tsquery('german', ${input.query})`)
    : and(...conditions);

  const rows = await db
    .select({
      id: fundingPrograms.id,
      slug: fundingPrograms.slug,
      titleDe: fundingPrograms.titleDe,
      titleEn: fundingPrograms.titleEn,
      fundingType: fundingPrograms.fundingType,
      fundingArea: fundingPrograms.fundingArea,
      fundingRegion: fundingPrograms.fundingRegion,
      fundingAmountInfo: fundingPrograms.fundingAmountInfo,
      level: fundingPrograms.level,
      state: fundingPrograms.state,
      sourceUrl: fundingPrograms.sourceUrl,
    })
    .from(fundingPrograms)
    .where(where)
    .limit(15);

  const sources = rows
    .filter((r) => r.sourceUrl)
    .map((r) => ({ label: r.titleDe ?? r.titleEn ?? "Förderprogramm", url: r.sourceUrl! }));

  return { data: rows, sources };
}

async function handleSearchSophex(input: { query: string }): Promise<ToolResult> {
  const q = input.query;

  const [rechtsformResults, permitResults, fundingResults, taxResults] = await Promise.all([
    db
      .select({ id: rechtsformen.id, name: rechtsformen.name, sourceUrl: rechtsformen.sourceUrl, type: sql<string>`'rechtsform'` })
      .from(rechtsformen)
      .where(or(ilike(rechtsformen.name, `%${q}%`), ilike(rechtsformen.fullName, `%${q}%`)))
      .limit(5),

    db
      .select({ id: permits.id, name: permits.labelDe, sourceUrl: permits.sourceUrl, type: sql<string>`'permit'` })
      .from(permits)
      .where(or(ilike(permits.labelDe, `%${q}%`), ilike(permits.descriptionDe, `%${q}%`)))
      .limit(5),

    db
      .select({ id: fundingPrograms.id, name: fundingPrograms.titleDe, sourceUrl: fundingPrograms.sourceUrl, type: sql<string>`'funding'` })
      .from(fundingPrograms)
      .where(
        and(
          eq(fundingPrograms.isActive, true),
          sql`search_vector @@ plainto_tsquery('german', ${q})`,
        ),
      )
      .limit(5),

    db
      .select({ id: taxObligations.id, name: taxObligations.taxType, sourceUrl: taxObligations.sourceUrl, type: sql<string>`'tax'` })
      .from(taxObligations)
      .where(ilike(taxObligations.taxType, `%${q}%`))
      .limit(5),
  ]);

  const all = [...rechtsformResults, ...permitResults, ...fundingResults, ...taxResults];
  const sources: Array<{ label: string; url: string }> = [];
  const seen = new Set<string>();
  for (const r of all) {
    if (r.sourceUrl && !seen.has(r.sourceUrl)) {
      seen.add(r.sourceUrl);
      sources.push({ label: r.name ?? "Result", url: r.sourceUrl });
    }
  }

  return { data: all, sources };
}

// Dispatch a tool call by name
async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  switch (name) {
    case "get_rechtsformen":
      return handleGetRechtsformen(input as { slug?: string });
    case "get_steuern":
      return handleGetSteuern(input as { rechtsformSlug?: string; includeDeadlines?: boolean });
    case "get_gewerbeanmeldung":
      return handleGetGewerbeanmeldung(input as { bundesland?: string });
    case "get_genehmigungen":
      return handleGetGenehmigungen(
        input as {
          tradeCategory?: string;
          permitCategory?: string;
          query?: string;
          includeBG?: boolean;
        },
      );
    case "get_sozialversicherung":
      return handleGetSozialversicherung();
    case "get_handelsregister":
      return handleGetHandelsregister(input as { rechtsformSlug?: string });
    case "get_foerderprogramme":
      return handleGetFoerderprogramme(
        input as { query?: string; level?: string; state?: string; fundingType?: string },
      );
    case "search_sophex":
      return handleSearchSophex(input as { query: string });
    default:
      return { data: { error: `Unknown tool: ${name}` }, sources: [] };
  }
}

// ─── Anthropic API types ───────────────────────────────────────────────────────

type AnthropicMessage = {
  role: "user" | "assistant";
  content: string | AnthropicContent[];
};

type AnthropicContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

type AnthropicResponse = {
  content: AnthropicContent[];
  stop_reason: string;
  usage?: { input_tokens: number; output_tokens: number };
};

// ─── POST /v1/assistant ────────────────────────────────────────────────────────

assistantRouter.post("/", async (c) => {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    return c.json(
      { data: null, meta: null, error: "AI assistant is not configured (missing ANTHROPIC_API_KEY)" },
      503,
    );
  }

  // Rate limiting: 10 req/min per IP
  const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return c.json(
      { data: null, meta: null, error: "Rate limit exceeded: max 10 requests per minute" },
      429,
    );
  }

  // Parse and validate request body
  const body = await c.req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { data: null, meta: null, error: "Invalid request", details: parsed.error.flatten() },
      400,
    );
  }

  const { messages, context } = parsed.data;

  // Enforce input token budget (~2000 tokens ≈ 8000 chars)
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalChars > MAX_INPUT_CHARS) {
    return c.json(
      {
        data: null,
        meta: null,
        error: `Request too large: total message length exceeds ${MAX_INPUT_CHARS} characters (~2000 tokens)`,
      },
      400,
    );
  }

  // Build system prompt, optionally injecting context
  let systemPrompt = SYSTEM_PROMPT;
  if (context?.bundesland || context?.rechtsform) {
    const ctxParts = [];
    if (context.bundesland) ctxParts.push(`Bundesland: ${context.bundesland}`);
    if (context.rechtsform) ctxParts.push(`Rechtsform: ${context.rechtsform}`);
    systemPrompt += `\n\nUser context: ${ctxParts.join(", ")}`;
  }

  // Agentic loop
  const conversationMessages: AnthropicMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  const allSources: Array<{ label: string; url: string }> = [];
  const toolsCalled: string[] = [];
  let finalReply = "";
  let totalUsage = { input_tokens: 0, output_tokens: 0 };

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    let res: Response;
    try {
      res = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: ASSISTANT_MODEL,
          max_tokens: 2048,
          system: systemPrompt,
          messages: conversationMessages,
          tools: TOOLS,
        }),
      });
    } catch (err) {
      console.error("Anthropic API fetch error:", err);
      return c.json({ data: null, meta: null, error: "Failed to reach AI service" }, 502);
    }

    if (!res.ok) {
      const errText = await res.text();
      console.error("Anthropic API error:", res.status, errText);
      return c.json({ data: null, meta: null, error: "AI service error" }, 502);
    }

    const apiResponse = (await res.json()) as AnthropicResponse;

    // Accumulate token usage
    if (apiResponse.usage) {
      totalUsage.input_tokens += apiResponse.usage.input_tokens;
      totalUsage.output_tokens += apiResponse.usage.output_tokens;
    }

    // Check for text response (final answer)
    if (apiResponse.stop_reason === "end_turn") {
      const textBlock = apiResponse.content.find((b) => b.type === "text") as
        | { type: "text"; text: string }
        | undefined;
      finalReply = textBlock?.text ?? "";
      break;
    }

    // Handle tool_use blocks
    if (apiResponse.stop_reason === "tool_use") {
      // Append assistant's response (with tool_use blocks) to conversation
      conversationMessages.push({ role: "assistant", content: apiResponse.content });

      // Execute each tool and collect results
      const toolResultContents: AnthropicContent[] = [];

      for (const block of apiResponse.content) {
        if (block.type !== "tool_use") continue;

        toolsCalled.push(block.name);

        let toolResult: ToolResult;
        try {
          toolResult = await executeTool(block.name, block.input);
        } catch (err) {
          console.error(`Tool ${block.name} error:`, err);
          toolResult = { data: { error: "Tool execution failed" }, sources: [] };
        }

        // Collect sources from tool result
        for (const src of toolResult.sources) {
          if (!allSources.some((s) => s.url === src.url)) {
            allSources.push(src);
          }
        }

        toolResultContents.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(toolResult.data),
        });
      }

      // Append tool results as a user message
      conversationMessages.push({ role: "user", content: toolResultContents });
      continue;
    }

    // Unexpected stop_reason — extract any text content and break
    const textBlock = apiResponse.content.find((b) => b.type === "text") as
      | { type: "text"; text: string }
      | undefined;
    finalReply = textBlock?.text ?? "";
    break;
  }

  return c.json({
    data: {
      reply: finalReply,
      sources: allSources,
      tools_called: [...new Set(toolsCalled)],
    },
    meta: {
      tokens: totalUsage,
      model: ASSISTANT_MODEL,
    },
    error: null,
  });
});
