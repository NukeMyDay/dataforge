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
function mcpError(code, message) {
    return { error: { code, message } };
}
const TOOLS = [];
mcpRouter.post("/", async (c) => {
    let body;
    try {
        body = await c.req.json();
    }
    catch {
        return c.json(mcpError(MCP_ERRORS.PARSE_ERROR, "Invalid JSON"), 400);
    }
    if (typeof body !== "object" || body === null || !("method" in body)) {
        return c.json(mcpError(MCP_ERRORS.INVALID_REQUEST, "Missing method"), 400);
    }
    const { method } = body;
    if (method === "tools/list") {
        return c.json({ tools: TOOLS });
    }
    return c.json(mcpError(MCP_ERRORS.METHOD_NOT_FOUND, `Unknown method: ${method}`), 404);
});
//# sourceMappingURL=mcp.js.map