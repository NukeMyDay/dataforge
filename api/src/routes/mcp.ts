import { Hono } from "hono";

// Model Context Protocol endpoint — no API key required
export const mcpRouter = new Hono();

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

const TOOLS: unknown[] = [];

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

  const { method } = body as { method: string; params?: unknown };

  if (method === "tools/list") {
    return c.json({ tools: TOOLS });
  }

  return c.json(mcpError(MCP_ERRORS.METHOD_NOT_FOUND, `Unknown method: ${method}`), 404);
});
