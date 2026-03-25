import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { programsRouter } from "./routes/programs.js";
import { institutionsRouter } from "./routes/institutions.js";
import { regulationsRouter } from "./routes/regulations.js";
import { mcpRouter } from "./routes/mcp.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.get("/health", (c) => c.json({ status: "ok" }));

// /v1/* routes require auth + rate limiting
app.use("/v1/*", authMiddleware);
app.use("/v1/*", rateLimitMiddleware);

app.route("/v1/programs", programsRouter);
app.route("/v1/institutions", institutionsRouter);
app.route("/v1/regulations", regulationsRouter);
app.route("/mcp", mcpRouter);

const port = Number(process.env["PORT"] ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`DataForge API listening on port ${port}`);
});
