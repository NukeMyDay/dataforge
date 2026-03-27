import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { exportRouter } from "./routes/export.js";
import { mcpRouter } from "./routes/mcp.js";
import { authRouter } from "./routes/auth.js";
import { adminRouter } from "./routes/admin.js";
import { chatRouter } from "./routes/chat.js";
import { statsRouter } from "./routes/stats.js";
import { sitemapRouter } from "./routes/sitemap.js";
import { billingRouter } from "./routes/billing.js";
import { fundingRouter } from "./routes/funding.js";
import { provenanceRouter } from "./routes/provenance.js";
import { rechtsformenRouter } from "./routes/rechtsformen.js";
import { sozialversicherungRouter } from "./routes/sozialversicherung.js";
import { steuernRouter } from "./routes/steuern.js";
import { genehmigungenRouter } from "./routes/genehmigungen.js";
import { handelsregisterRouter } from "./routes/handelsregister.js";
import { sourcesRouter } from "./routes/sources.js";
import { verifyRouter } from "./routes/verify.js";
import { integrityRouter } from "./routes/integrity.js";
import { assistantRouter } from "./routes/assistant.js";
import { streamRouter } from "./routes/stream.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { searchRouter } from "./routes/search.js";
import { authMiddleware } from "./middleware/auth.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { openApiSpec } from "./openapi.js";

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/robots.txt", (c) => {
  const webBase = process.env["WEB_BASE_URL"] ?? "https://gonear.de";
  c.header("Content-Type", "text/plain");
  return c.body(`User-agent: *\nAllow: /\nSitemap: ${webBase}/sitemap.xml\n`);
});

// OpenAPI spec and Swagger UI — public, registered before authMiddleware
app.get("/v1/openapi.json", (c) => c.json(openApiSpec));
app.get("/v1/docs", (c) =>
  c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DataForge API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/v1/openapi.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
    });
  </script>
</body>
</html>`),
);

// Auth routes are public (JWT-based, no API key required)
app.route("/v1/auth", authRouter);

// Chat is public but rate-limited by IP (no API key needed for basic use)
app.route("/v1/chat", chatRouter);

// Sophex Startup Assistant — public (anonymous), rate-limited by IP
app.route("/v1/assistant", assistantRouter);

// Admin routes use JWT Bearer auth — registered before the API key middleware to bypass it
app.route("/v1/admin", adminRouter);

// Stats is public — no API key required
app.route("/v1/stats", statsRouter);

// Sitemap — public, for SEO crawlers
app.route("/sitemap.xml", sitemapRouter);

// Export endpoints are public — no API key required, registered before authMiddleware
app.route("/v1", exportRouter);

// Billing: checkout + portal require JWT; webhook is public (Stripe calls it)
app.route("/v1/billing", billingRouter);

// All other /v1/* routes require API key auth + rate limiting
app.use("/v1/*", authMiddleware);
app.use("/v1/*", rateLimitMiddleware);

// Data endpoints — require API key
app.route("/v1/funding", fundingRouter);
app.route("/v1/provenance", provenanceRouter);
app.route("/v1", rechtsformenRouter);
app.route("/v1", sozialversicherungRouter);
app.route("/v1", steuernRouter);
app.route("/v1", genehmigungenRouter);
app.route("/v1", handelsregisterRouter);
app.route("/v1/sources", sourcesRouter);
app.route("/v1/verify", verifyRouter);
app.route("/v1/integrity", integrityRouter);

// Unified cross-silo search — requires API key
app.route("/v1/search", searchRouter);

// Real-time delivery — SSE stream (public, read-only) + webhook management (JWT)
app.route("/v1/stream", streamRouter);
app.route("/v1/webhooks", webhooksRouter);

app.route("/mcp", mcpRouter);

const port = Number(process.env["PORT"] ?? 3000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`DataForge API listening on port ${port}`);
});
