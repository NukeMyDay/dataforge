import { Hono } from "hono";

export const sitemapRouter = new Hono();

const WEB_BASE = process.env["WEB_BASE_URL"] ?? "https://gonear.de";

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function urlEntry(loc: string, lastmod?: string | null, changefreq = "weekly", priority = "0.7"): string {
  const lastmodTag = lastmod ? `\n    <lastmod>${lastmod.slice(0, 10)}</lastmod>` : "";
  return `  <url>
    <loc>${xmlEscape(`${WEB_BASE}${loc}`)}</loc>${lastmodTag}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

// GET /sitemap.xml — public, crawlable
sitemapRouter.get("/", (c) => {
  const entries = [
    urlEntry("/", null, "daily", "1.0"),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join("\n")}
</urlset>`;

  c.header("Content-Type", "application/xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=21600");
  return c.body(xml);
});
