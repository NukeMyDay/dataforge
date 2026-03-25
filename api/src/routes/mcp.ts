import { Hono } from "hono";

// Model Context Protocol endpoint — returns structured data for LLM consumption
export const mcpRouter = new Hono();

mcpRouter.get("/manifest", (c) => {
  return c.json({
    name: "DataForge MCP",
    version: "0.1.0",
    resources: [
      { name: "programs", description: "Accredited study programs (NL, DE)" },
      { name: "institutions", description: "Accredited institutions" },
      { name: "regulations", description: "German regulatory requirements (NRW event permits)" },
    ],
  });
});

mcpRouter.post("/query", async (c) => {
  // TODO: implement MCP query handling
  return c.json({ error: "Not implemented" }, 501);
});
