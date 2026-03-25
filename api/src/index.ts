import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { programsRouter } from "./routes/programs.js";
import { institutionsRouter } from "./routes/institutions.js";
import { regulationsRouter } from "./routes/regulations.js";
import { mcpRouter } from "./routes/mcp.js";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.get("/health", (c) => c.json({ status: "ok" }));

app.route("/v1/programs", programsRouter);
app.route("/v1/institutions", institutionsRouter);
app.route("/v1/regulations", regulationsRouter);
app.route("/mcp", mcpRouter);

const port = Number(process.env["PORT"] ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`DataForge API listening on port ${port}`);
});
