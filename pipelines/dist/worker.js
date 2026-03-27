// src/worker.ts
import PgBoss from "pg-boss";

// src/jobs/quota-warnings.ts
import { db, apiKeys, users } from "@dataforge/db";
import { eq, and, isNotNull, lt, gt } from "drizzle-orm";

// src/email.ts
import { createTransport } from "nodemailer";
var SMTP_HOST = process.env["SMTP_HOST"] ?? "";
var SMTP_PORT = Number(process.env["SMTP_PORT"] ?? 587);
var SMTP_USER = process.env["SMTP_USER"] ?? "";
var SMTP_PASSWORD = process.env["SMTP_PASSWORD"] ?? "";
var SMTP_FROM = process.env["SMTP_FROM"] ?? "noreply@gonear.de";
var _transporter = null;
function getTransporter() {
  if (!SMTP_HOST) return null;
  if (!_transporter) {
    _transporter = createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      // true for SSL, false for STARTTLS
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : void 0
    });
  }
  return _transporter;
}
async function sendEmail(opts) {
  const transport = getTransporter();
  if (!transport) {
    console.debug(`[email] SMTP not configured \u2014 skipping email to ${opts.to}: ${opts.subject}`);
    return false;
  }
  await transport.sendMail({
    from: SMTP_FROM,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html
  });
  return true;
}
async function sendApiKeyQuotaWarningEmail(email, usedPercent) {
  await sendEmail({
    to: email,
    subject: `DataForge: you've used ${usedPercent}% of your daily quota`,
    text: `Hi,

You've used ${usedPercent}% of your daily API request quota.

Upgrade to Pro for 100\xD7 more requests at https://gonear.de/dashboard

\u2014 DataForge Team`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="color: #d97706;">Quota warning: ${usedPercent}% used</h2>
  <p>You've used <strong>${usedPercent}%</strong> of your daily API quota.</p>
  <p>Upgrade to Pro for 10,000 requests/day (100\xD7 more).</p>
  <p><a href="https://gonear.de/dashboard" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">Upgrade to Pro</a></p>
  <p style="color: #6b7280; font-size: 14px;">\u2014 DataForge Team</p>
</body>
</html>`
  });
}
async function sendApiKeyExpiryWarningEmail(email, keyName, daysLeft) {
  await sendEmail({
    to: email,
    subject: `DataForge: API key "${keyName}" expires in ${daysLeft} days`,
    text: `Hi,

Your DataForge API key "${keyName}" expires in ${daysLeft} days.

Visit your dashboard to generate a new key: https://gonear.de/dashboard

\u2014 DataForge Team`,
    html: `<!DOCTYPE html>
<html>
<body style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
  <h2 style="color: #dc2626;">API key expiring soon</h2>
  <p>Your API key <strong>${keyName}</strong> expires in <strong>${daysLeft} days</strong>.</p>
  <p><a href="https://gonear.de/dashboard" style="display: inline-block; background: #2563eb; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600;">Manage API keys</a></p>
  <p style="color: #6b7280; font-size: 14px;">\u2014 DataForge Team</p>
</body>
</html>`
  });
}

// src/jobs/quota-warnings.ts
var FREE_TIER_DAILY_LIMIT = 100;
var QUOTA_WARN_THRESHOLD = 0.8;
var KEY_EXPIRY_WARN_DAYS = 14;
async function runQuotaWarnings() {
  console.log("[quota-warnings] Starting quota warning check");
  const now = /* @__PURE__ */ new Date();
  const nearLimitKeys = await db.select({ id: apiKeys.id, userId: apiKeys.userId, requestCount: apiKeys.requestCount }).from(apiKeys).where(
    and(
      eq(apiKeys.tier, "free"),
      eq(apiKeys.isActive, true),
      isNotNull(apiKeys.userId),
      gt(apiKeys.requestCount, Math.floor(FREE_TIER_DAILY_LIMIT * QUOTA_WARN_THRESHOLD)),
      lt(apiKeys.requestCount, FREE_TIER_DAILY_LIMIT)
    )
  ).limit(200);
  for (const key of nearLimitKeys) {
    if (!key.userId) continue;
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, key.userId)).limit(1);
    if (!user) continue;
    const usedPercent = Math.round(key.requestCount / FREE_TIER_DAILY_LIMIT * 100);
    await sendApiKeyQuotaWarningEmail(user.email, usedPercent).catch(
      (e) => console.error(`[quota-warnings] quota email failed for ${user.email}:`, e)
    );
  }
  const soonExpiring = await db.select({ id: apiKeys.id, name: apiKeys.name, userId: apiKeys.userId, expiresAt: apiKeys.expiresAt }).from(apiKeys).where(
    and(
      eq(apiKeys.isActive, true),
      isNotNull(apiKeys.expiresAt),
      isNotNull(apiKeys.userId),
      gt(apiKeys.expiresAt, now),
      lt(apiKeys.expiresAt, new Date(now.getTime() + KEY_EXPIRY_WARN_DAYS * 24 * 60 * 60 * 1e3))
    )
  ).limit(200);
  for (const key of soonExpiring) {
    if (!key.userId || !key.expiresAt) continue;
    const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, key.userId)).limit(1);
    if (!user) continue;
    const daysLeft = Math.ceil((key.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1e3));
    await sendApiKeyExpiryWarningEmail(user.email, key.name ?? `Key #${key.id}`, daysLeft).catch(
      (e) => console.error(`[quota-warnings] expiry email failed for ${user.email}:`, e)
    );
  }
  console.log(`[quota-warnings] Done \u2014 quota: ${nearLimitKeys.length}, expiry: ${soonExpiring.length}`);
}

// src/jobs/scrape-funding-bund.ts
import { chromium } from "playwright";
import * as cheerio2 from "cheerio";
import { createHash } from "crypto";
import { db as db3, fundingPrograms, fundingChangelog, pipelines, pipelineRuns } from "@dataforge/db";
import { eq as eq3 } from "drizzle-orm";

// src/lib/freshness-check.ts
import { db as db2, sourceFingerprints } from "@dataforge/db";
import { eq as eq2 } from "drizzle-orm";
var USER_AGENT = "Mozilla/5.0 (compatible; DataForge-Bot/1.0; +https://dataforge.io/bot)";
async function probeUrl(url) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(1e4)
    });
    return {
      etag: res.headers.get("etag") ?? void 0,
      lastModified: res.headers.get("last-modified") ?? void 0
    };
  } catch {
    return null;
  }
}
async function needsRescrape(url) {
  const headers = await probeUrl(url);
  if (!headers || !headers.etag && !headers.lastModified) {
    return { needed: true, headers };
  }
  const stored = await db2.select({
    etag: sourceFingerprints.etag,
    lastModified: sourceFingerprints.lastModified
  }).from(sourceFingerprints).where(eq2(sourceFingerprints.url, url)).limit(1);
  if (stored.length === 0) {
    return { needed: true, headers };
  }
  const fp = stored[0];
  if (headers.etag && fp.etag && headers.etag === fp.etag) {
    await _incrementCheckCount(url, false);
    return { needed: false, headers };
  }
  if (headers.lastModified && fp.lastModified && headers.lastModified === fp.lastModified) {
    await _incrementCheckCount(url, false);
    return { needed: false, headers };
  }
  return { needed: true, headers };
}
async function recordFingerprint(url, headers, contentHash, changed) {
  const now = /* @__PURE__ */ new Date();
  const stored = await db2.select().from(sourceFingerprints).where(eq2(sourceFingerprints.url, url)).limit(1);
  if (stored.length === 0) {
    await db2.insert(sourceFingerprints).values({
      url,
      etag: headers?.etag,
      lastModified: headers?.lastModified,
      contentHash,
      lastCheckedAt: now,
      lastChangedAt: now,
      checkCount: 1,
      changeCount: 1
      // first scrape always counts as a change
    });
    return;
  }
  const fp = stored[0];
  const newCheckCount = fp.checkCount + 1;
  const newChangeCount = fp.changeCount + (changed ? 1 : 0);
  let avgChangeIntervalHours = fp.avgChangeIntervalHours;
  if (changed && fp.lastChangedAt) {
    const hoursSinceLast = (now.getTime() - fp.lastChangedAt.getTime()) / 36e5;
    avgChangeIntervalHours = avgChangeIntervalHours == null ? hoursSinceLast : 0.3 * hoursSinceLast + 0.7 * avgChangeIntervalHours;
  }
  await db2.update(sourceFingerprints).set({
    etag: headers?.etag ?? fp.etag,
    lastModified: headers?.lastModified ?? fp.lastModified,
    contentHash,
    lastCheckedAt: now,
    lastChangedAt: changed ? now : fp.lastChangedAt,
    checkCount: newCheckCount,
    changeCount: newChangeCount,
    avgChangeIntervalHours,
    updatedAt: now
  }).where(eq2(sourceFingerprints.url, url));
}
async function _incrementCheckCount(url, changed) {
  const stored = await db2.select({
    checkCount: sourceFingerprints.checkCount,
    changeCount: sourceFingerprints.changeCount,
    lastChangedAt: sourceFingerprints.lastChangedAt,
    avgChangeIntervalHours: sourceFingerprints.avgChangeIntervalHours
  }).from(sourceFingerprints).where(eq2(sourceFingerprints.url, url)).limit(1);
  if (stored.length === 0) return;
  const fp = stored[0];
  const now = /* @__PURE__ */ new Date();
  await db2.update(sourceFingerprints).set({
    checkCount: fp.checkCount + 1,
    changeCount: fp.changeCount + (changed ? 1 : 0),
    lastCheckedAt: now,
    updatedAt: now
  }).where(eq2(sourceFingerprints.url, url));
}

// src/lib/llm-extractor.ts
import * as cheerio from "cheerio";
var ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
var ANTHROPIC_VERSION = "2023-06-01";
var MODEL = "claude-haiku-4-5";
var MAX_CONTENT_CHARS = 12e3;
function stripHtmlNoise(html) {
  const $ = cheerio.load(html);
  $(
    "nav, footer, header, script, style, noscript, .navigation, .nav, .breadcrumb, .sidebar, .menu, .cookie-banner, .cookie-notice, .search-form, [role='navigation'], [role='banner'], [role='contentinfo']"
  ).remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return text.substring(0, MAX_CONTENT_CHARS);
}
async function callAnthropicAPI(messages, maxTokens = 1024) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "[llm-extractor] ANTHROPIC_API_KEY environment variable is not set"
    );
  }
  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json"
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
    signal: AbortSignal.timeout(3e4)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `[llm-extractor] Anthropic API error ${response.status}: ${body}`
    );
  }
  return await response.json();
}
async function extractFieldsWithLLM(input) {
  const fieldNames = Object.keys(input.fields);
  if (fieldNames.length === 0) {
    return { fields: {}, tokensInput: 0, tokensOutput: 0, durationMs: 0 };
  }
  const content = stripHtmlNoise(input.html);
  const fieldDescriptions = fieldNames.map((name) => {
    const schema = input.fields[name];
    const hint = schema.hint ? ` (${schema.hint})` : "";
    return `  "${name}": ${schema.description}${hint}`;
  }).join("\n");
  const prompt = `Extract the following fields from this German government page. Return a JSON object with exactly these keys. Use null for fields that cannot be found.

Fields to extract:
{
${fieldDescriptions}
}

Page content:
${content}

Return only valid JSON, no explanation.`;
  const t0 = Date.now();
  const response = await callAnthropicAPI([{ role: "user", content: prompt }]);
  const durationMs = Date.now() - t0;
  const fields = Object.fromEntries(
    fieldNames.map((f) => [f, null])
  );
  const textBlock = response.content.find((b) => b.type === "text");
  if (textBlock?.type === "text" && textBlock.text) {
    try {
      const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        for (const name of fieldNames) {
          const val = parsed[name];
          if (typeof val === "string" && val.trim().length > 0) {
            fields[name] = val.trim();
          }
        }
      }
    } catch {
      console.warn(
        "[llm-extractor] Failed to parse JSON response from LLM:",
        textBlock.text.substring(0, 200)
      );
    }
  }
  return {
    fields,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    durationMs
  };
}
async function mergeWithLlmFallback(cssFields, html, fieldSchemas, enableLlm = true) {
  const log = {
    fieldSources: {},
    llmTokensUsed: 0,
    llmCalls: 0,
    llmDurationMs: 0
  };
  const missingFields = [];
  for (const field of Object.keys(cssFields)) {
    if (cssFields[field] !== null) {
      log.fieldSources[field] = "css";
    } else {
      missingFields.push(field);
      log.fieldSources[field] = "none";
    }
  }
  if (!enableLlm || missingFields.length === 0) {
    return { merged: cssFields, log };
  }
  const missingSchemas = {};
  for (const field of missingFields) {
    if (fieldSchemas[field]) {
      missingSchemas[field] = fieldSchemas[field];
    }
  }
  const llmResult = await extractFieldsWithLLM({ html, fields: missingSchemas });
  log.llmCalls++;
  log.llmTokensUsed += llmResult.tokensInput + llmResult.tokensOutput;
  log.llmDurationMs += llmResult.durationMs;
  const merged = { ...cssFields };
  for (const field of missingFields) {
    const llmVal = llmResult.fields[field];
    if (llmVal) {
      merged[field] = llmVal;
      log.fieldSources[field] = "llm";
    }
  }
  return { merged, log };
}

// src/jobs/scrape-funding-bund.ts
var BASE_URL = "https://www.foerderdatenbank.de";
var SEARCH_URL = `${BASE_URL}/SiteGlobals/FDB/Forms/Suche/Foederprogrammsuche_Formular.html`;
var REQUEST_DELAY_MS = 2e3;
var MAX_PAGES = 260;
var USER_AGENT2 = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
var PIPELINE_NAME = "scrape-funding-bund";
var LLM_FALLBACK_ENABLED = process.env.FUNDING_LLM_FALLBACK === "true";
var FUNDING_FIELD_SCHEMAS = {
  summaryDe: {
    description: "Short summary of the funding program in German",
    hint: "look for 'Kurztext' or 'Kurzzusammenfassung' headings"
  },
  descriptionDe: {
    description: "Full description of the funding program in German",
    hint: "look for 'Volltext' heading"
  },
  legalRequirementsDe: {
    description: "Legal requirements and eligibility criteria in German",
    hint: "look for 'Rechtliche Voraussetzungen' or 'Voraussetzungen' headings"
  },
  directiveDe: {
    description: "Legal basis and directives in German",
    hint: "look for 'Richtlinie' or 'Rechtsgrundlage' headings"
  },
  applicationProcess: {
    description: "Application process and procedure in German",
    hint: "look for 'Antrag', 'Verfahren', or 'Wie beantrage' headings"
  },
  deadlineInfo: {
    description: "Application deadline or cut-off dates in German",
    hint: "look for 'Frist', 'Termin', or 'Stichtag' headings"
  },
  fundingAmountInfo: {
    description: "Funding amounts, grant values, loan limits \u2014 e.g. 'bis zu X Euro', '80% der Kosten'",
    hint: "look in the summary or description text for monetary amounts"
  }
};
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function slugify(text) {
  return text.toLowerCase().replace(/[äöüß]/g, (c) => ({ \u00E4: "ae", \u00F6: "oe", \u00FC: "ue", \u00DF: "ss" })[c] ?? c).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").substring(0, 500);
}
function makeContentHash(obj) {
  const str = Object.values(obj).filter(Boolean).join("|");
  return createHash("sha256").update(str).digest("hex");
}
function deriveLevelAndState(url) {
  const path = url.toLowerCase();
  if (path.includes("/bund/")) return { level: "bund", state: null };
  if (path.includes("/eu/")) return { level: "eu", state: null };
  const stateMatch = path.match(/\/land\/([^/]+)\//);
  if (stateMatch) {
    const stateMap = {
      "baden-wuerttemberg": "Baden-W\xFCrttemberg",
      "bayern": "Bayern",
      "berlin": "Berlin",
      "brandenburg": "Brandenburg",
      "bremen": "Bremen",
      "hamburg": "Hamburg",
      "hessen": "Hessen",
      "mecklenburg-vorpommern": "Mecklenburg-Vorpommern",
      "niedersachsen": "Niedersachsen",
      "nrw": "Nordrhein-Westfalen",
      "nordrhein-westfalen": "Nordrhein-Westfalen",
      "rheinland-pfalz": "Rheinland-Pfalz",
      "saarland": "Saarland",
      "sachsen": "Sachsen",
      "sachsen-anhalt": "Sachsen-Anhalt",
      "schleswig-holstein": "Schleswig-Holstein",
      "thueringen": "Th\xFCringen"
    };
    return { level: "land", state: stateMap[stateMatch[1]] ?? stateMatch[1] };
  }
  return { level: "bund", state: null };
}
function deriveCategory(fundingArea) {
  if (!fundingArea) return "Sonstiges";
  const lower = fundingArea.toLowerCase();
  if (lower.includes("existenzgr\xFCndung")) return "Existenzgr\xFCndung";
  if (lower.includes("forschung") || lower.includes("innovation")) return "Forschung & Innovation";
  if (lower.includes("umwelt") || lower.includes("energie") || lower.includes("klima")) return "Umwelt & Energie";
  if (lower.includes("bildung") || lower.includes("qualifizierung")) return "Bildung & Qualifizierung";
  if (lower.includes("digitalisierung")) return "Digitalisierung";
  if (lower.includes("infrastruktur") || lower.includes("bau")) return "Infrastruktur & Bau";
  if (lower.includes("landwirtschaft") || lower.includes("agrar")) return "Landwirtschaft";
  if (lower.includes("sozial") || lower.includes("gesundheit")) return "Soziales & Gesundheit";
  if (lower.includes("kultur")) return "Kultur";
  if (lower.includes("au\xDFenwirtschaft") || lower.includes("international")) return "Internationalisierung";
  if (lower.includes("unternehmensfinanzierung")) return "Unternehmensfinanzierung";
  if (lower.includes("wohnungsbau") || lower.includes("wohnen")) return "Wohnungsbau";
  return fundingArea.split(",")[0].trim();
}
async function collectAllProgramUrls(page) {
  const allUrls = /* @__PURE__ */ new Set();
  let consecutiveEmpty = 0;
  const firstUrl = `${SEARCH_URL}?filterCategories=FundingProgram&submit=Suchen`;
  await page.goto(firstUrl, { waitUntil: "domcontentloaded", timeout: 3e4 });
  await sleep(REQUEST_DELAY_MS);
  let html = await page.content();
  let $ = cheerio2.load(html);
  let guid = null;
  $(".pagination a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const match = href.match(/gtp=%2526([a-f0-9-]+)_list/);
    if (match) guid = match[1];
  });
  if (!guid) {
    console.warn("[fetcher] Could not extract pagination GUID, falling back to page 1 only");
  }
  function extractLinks($doc) {
    const links = [];
    $doc("a[href*='FDB/Content/DE/Foerderprogramm']").each((_, el) => {
      let href = $doc(el).attr("href");
      if (!href || !href.endsWith(".html")) return;
      if (!href.startsWith("http")) href = `${BASE_URL}/${href}`;
      if (!allUrls.has(href)) links.push(href);
    });
    return links;
  }
  const firstLinks = extractLinks($);
  firstLinks.forEach((u) => allUrls.add(u));
  console.log(`[fetcher] Page 1: ${firstLinks.length} new URLs (${allUrls.size} total)`);
  if (!guid) return [...allUrls];
  for (let pageNo = 2; pageNo <= MAX_PAGES; pageNo++) {
    const url = `${SEARCH_URL}?gtp=%2526${guid}_list%253D${pageNo}&submit=Suchen&filterCategories=FundingProgram`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 3e4 });
      await sleep(REQUEST_DELAY_MS);
      html = await page.content();
      $ = cheerio2.load(html);
      const pageLinks = extractLinks($);
      pageLinks.forEach((u) => allUrls.add(u));
      if (pageLinks.length === 0) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 3) break;
      } else {
        consecutiveEmpty = 0;
      }
      if (pageNo % 25 === 0) {
        console.log(`[fetcher] Page ${pageNo}: ${pageLinks.length} new URLs (${allUrls.size} total)`);
      }
    } catch (err) {
      console.warn(`[fetcher] Page ${pageNo} failed: ${err}. Continuing...`);
    }
  }
  console.log(`[fetcher] Collected ${allUrls.size} unique program URLs`);
  return [...allUrls];
}
function parseFundingPage(html) {
  const $ = cheerio2.load(html);
  const titleDe = $("h1.ismark, h1").first().text().trim().replace(/^Förderprogramm\s*/i, "");
  if (!titleDe || titleDe.length < 3) return null;
  const meta = {};
  $("dt").each((_, el) => {
    const key = $(el).text().trim().replace(/:$/, "").toLowerCase();
    const dd = $(el).next("dd");
    if (dd.length) meta[key] = dd.text().trim();
  });
  function extractSection5(headingTexts) {
    const result = [];
    $("h2, h3").each((_, el) => {
      const heading = $(el).text().trim().toLowerCase();
      if (!headingTexts.some((h) => heading.includes(h.toLowerCase()))) return;
      let next = $(el).next();
      while (next.length && !next.is("h2, h3")) {
        const text = next.text().trim();
        if (text) result.push(text);
        next = next.next();
      }
    });
    return result.length > 0 ? result.join("\n\n") : null;
  }
  const summaryDe = extractSection5(["kurztext", "kurzzusammenfassung"]);
  const descriptionDe = extractSection5(["volltext"]);
  const legalRequirementsDe = extractSection5(["rechtliche voraussetzungen", "voraussetzungen"]);
  const directiveDe = extractSection5(["richtlinie", "rechtsgrundlage"]);
  const applicationProcess = extractSection5(["antrag", "verfahren", "wie beantrage"]);
  const deadlineInfo = extractSection5(["frist", "termin", "stichtag"]);
  let fundingAmountInfo = null;
  const fullText = [summaryDe, descriptionDe].filter(Boolean).join(" ");
  const amountPatterns = [
    /(?:bis zu|maximal|höchstens)\s+(?:EUR\s+)?[\d.,]+\s*(?:Millionen|Mio|Euro|EUR|Prozent|%)/gi,
    /(?:Zuschuss|Darlehen|Förderung|Betrag)\s+(?:von\s+)?(?:bis zu\s+)?(?:EUR\s+)?[\d.,]+\s*(?:Millionen|Mio|Euro|EUR|Prozent|%)/gi,
    /[\d.,]+\s*(?:Prozent|%)\s*(?:der\s+)?(?:förderfähigen|zuwendungsfähigen)/gi
  ];
  const amounts = [];
  for (const pattern of amountPatterns) {
    const matches = fullText.match(pattern) || [];
    amounts.push(...matches);
  }
  if (amounts.length > 0) fundingAmountInfo = [...new Set(amounts)].join("; ");
  return {
    titleDe,
    fundingType: meta["f\xF6rderart"] ?? null,
    fundingArea: meta["f\xF6rderbereich"] ?? null,
    fundingRegion: meta["f\xF6rdergebiet"] ?? null,
    eligibleApplicants: meta["f\xF6rderberechtigte"] ?? null,
    contactInfo: meta["ansprechpunkt"] ?? null,
    summaryDe,
    descriptionDe,
    legalRequirementsDe,
    directiveDe,
    fundingAmountInfo,
    applicationProcess,
    deadlineInfo
  };
}
async function parseFundingPageHybrid(html) {
  const cssResult = parseFundingPage(html);
  if (!cssResult) return { parsed: null, log: null };
  if (!LLM_FALLBACK_ENABLED) {
    return { parsed: cssResult, log: null };
  }
  const textFieldSubset = {
    summaryDe: cssResult.summaryDe,
    descriptionDe: cssResult.descriptionDe,
    legalRequirementsDe: cssResult.legalRequirementsDe,
    directiveDe: cssResult.directiveDe,
    applicationProcess: cssResult.applicationProcess,
    deadlineInfo: cssResult.deadlineInfo,
    fundingAmountInfo: cssResult.fundingAmountInfo
  };
  const { merged, log } = await mergeWithLlmFallback(
    textFieldSubset,
    html,
    FUNDING_FIELD_SCHEMAS,
    true
  );
  const finalParsed = {
    ...cssResult,
    ...merged
  };
  return { parsed: finalParsed, log };
}
async function upsertFunding(parsed, sourceUrl, runId) {
  const now = /* @__PURE__ */ new Date();
  const { level, state } = deriveLevelAndState(sourceUrl);
  const category = deriveCategory(parsed.fundingArea);
  const slug = slugify(`${level}-${state ?? "de"}-${parsed.titleDe}`);
  const hash = makeContentHash({
    title: parsed.titleDe,
    summary: parsed.summaryDe,
    description: parsed.descriptionDe,
    requirements: parsed.legalRequirementsDe,
    directive: parsed.directiveDe,
    fundingType: parsed.fundingType,
    fundingArea: parsed.fundingArea,
    eligibleApplicants: parsed.eligibleApplicants
  });
  const existing = await db3.select({ id: fundingPrograms.id, version: fundingPrograms.version, contentHash: fundingPrograms.contentHash }).from(fundingPrograms).where(eq3(fundingPrograms.sourceUrl, sourceUrl)).limit(1);
  if (existing.length > 0) {
    const current = existing[0];
    if (current.contentHash === hash) {
      await db3.update(fundingPrograms).set({ lastScrapedAt: now }).where(eq3(fundingPrograms.id, current.id));
      return "unchanged";
    }
    const nextVersion = current.version + 1;
    await db3.update(fundingPrograms).set({
      titleDe: parsed.titleDe,
      fundingType: parsed.fundingType,
      fundingArea: parsed.fundingArea,
      fundingRegion: parsed.fundingRegion,
      eligibleApplicants: parsed.eligibleApplicants,
      contactInfo: parsed.contactInfo,
      summaryDe: parsed.summaryDe,
      descriptionDe: parsed.descriptionDe,
      legalRequirementsDe: parsed.legalRequirementsDe,
      directiveDe: parsed.directiveDe,
      fundingAmountInfo: parsed.fundingAmountInfo,
      applicationProcess: parsed.applicationProcess,
      deadlineInfo: parsed.deadlineInfo,
      level,
      state,
      category,
      contentHash: hash,
      version: nextVersion,
      updatedAt: now,
      lastScrapedAt: now
    }).where(eq3(fundingPrograms.id, current.id));
    await db3.insert(fundingChangelog).values({
      fundingProgramId: current.id,
      version: nextVersion,
      changesDe: "Inhalt aktualisiert",
      contentHash: hash,
      scrapeRunId: runId
    });
    return "updated";
  }
  const inserted = await db3.insert(fundingPrograms).values({
    slug,
    titleDe: parsed.titleDe,
    fundingType: parsed.fundingType,
    fundingArea: parsed.fundingArea,
    fundingRegion: parsed.fundingRegion,
    eligibleApplicants: parsed.eligibleApplicants,
    contactInfo: parsed.contactInfo,
    summaryDe: parsed.summaryDe,
    descriptionDe: parsed.descriptionDe,
    legalRequirementsDe: parsed.legalRequirementsDe,
    directiveDe: parsed.directiveDe,
    fundingAmountInfo: parsed.fundingAmountInfo,
    applicationProcess: parsed.applicationProcess,
    deadlineInfo: parsed.deadlineInfo,
    level,
    state,
    category,
    sourceUrl,
    contentHash: hash,
    isActive: true,
    version: 1,
    lastScrapedAt: now
  }).onConflictDoUpdate({
    target: fundingPrograms.slug,
    set: { titleDe: parsed.titleDe, sourceUrl, contentHash: hash, updatedAt: now, lastScrapedAt: now }
  }).returning({ id: fundingPrograms.id });
  if (inserted[0]) {
    await db3.insert(fundingChangelog).values({
      fundingProgramId: inserted[0].id,
      version: 1,
      changesDe: "Ersterfassung",
      contentHash: hash,
      scrapeRunId: runId
    }).onConflictDoNothing();
  }
  return "new";
}
async function ensurePipeline() {
  const existing = await db3.select({ id: pipelines.id }).from(pipelines).where(eq3(pipelines.name, PIPELINE_NAME)).limit(1);
  if (existing.length > 0) return existing[0].id;
  const [row] = await db3.insert(pipelines).values({
    name: PIPELINE_NAME,
    description: "Scrapes all German funding programs from foerderdatenbank.de (BMWi)",
    schedule: "0 2 * * 0",
    enabled: true
  }).returning({ id: pipelines.id });
  return row.id;
}
async function scrapeFundingBund() {
  console.log(`[${PIPELINE_NAME}] Pipeline starting`);
  const pipelineId = await ensurePipeline();
  const [runRow] = await db3.insert(pipelineRuns).values({ pipelineId, status: "running", startedAt: /* @__PURE__ */ new Date() }).returning({ id: pipelineRuns.id });
  const runId = runRow.id;
  let newCount = 0, updatedCount = 0, unchangedCount = 0, errorCount = 0;
  let errorMessage = null;
  let browser = null;
  const llmStats = {
    pagesWithLlmCall: 0,
    totalTokensUsed: 0,
    fieldsFilled: 0,
    fieldsAttempted: 0
  };
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ userAgent: USER_AGENT2 });
    const page = await context.newPage();
    const urls = await collectAllProgramUrls(page);
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        const { needed, headers } = await needsRescrape(url);
        if (!needed) {
          unchangedCount++;
          if ((i + 1) % 50 === 0) {
            console.log(`[${PIPELINE_NAME}] Progress: ${i + 1}/${urls.length} (skipped via HEAD \u2014 cached)`);
          }
          continue;
        }
        await sleep(REQUEST_DELAY_MS);
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 3e4 });
        const html = await page.content();
        const { parsed, log } = await parseFundingPageHybrid(html);
        if (!parsed) {
          errorCount++;
          continue;
        }
        if (log) {
          llmStats.pagesWithLlmCall += log.llmCalls > 0 ? 1 : 0;
          llmStats.totalTokensUsed += log.llmTokensUsed;
          const attempted = Object.values(log.fieldSources).filter(
            (s) => s !== "css"
          ).length;
          const filled = Object.values(log.fieldSources).filter(
            (s) => s === "llm"
          ).length;
          llmStats.fieldsAttempted += attempted;
          llmStats.fieldsFilled += filled;
        }
        const result = await upsertFunding(parsed, url, runId);
        const hash = makeContentHash({
          title: parsed.titleDe,
          summary: parsed.summaryDe,
          description: parsed.descriptionDe,
          requirements: parsed.legalRequirementsDe,
          directive: parsed.directiveDe,
          fundingType: parsed.fundingType,
          fundingArea: parsed.fundingArea,
          eligibleApplicants: parsed.eligibleApplicants
        });
        await recordFingerprint(url, headers, hash, result !== "unchanged");
        if (result === "new") newCount++;
        else if (result === "updated") updatedCount++;
        else unchangedCount++;
        if ((i + 1) % 50 === 0) {
          console.log(`[${PIPELINE_NAME}] Progress: ${i + 1}/${urls.length} (new: ${newCount}, updated: ${updatedCount}, errors: ${errorCount})`);
        }
      } catch (err) {
        errorCount++;
        console.error(`[${PIPELINE_NAME}] Failed ${url}: ${err instanceof Error ? err.message : err}`);
      }
    }
    console.log(`[${PIPELINE_NAME}] Completed \u2014 new: ${newCount}, updated: ${updatedCount}, unchanged: ${unchangedCount}, errors: ${errorCount}`);
    if (LLM_FALLBACK_ENABLED) {
      const fillRate = llmStats.fieldsAttempted > 0 ? (llmStats.fieldsFilled / llmStats.fieldsAttempted * 100).toFixed(1) : "0.0";
      const estimatedCostUsd = (llmStats.totalTokensUsed / 1e6 * 3).toFixed(4);
      console.log(
        `[${PIPELINE_NAME}] LLM stats \u2014 pages with LLM call: ${llmStats.pagesWithLlmCall}, tokens used: ${llmStats.totalTokensUsed}, fields filled by LLM: ${llmStats.fieldsFilled}/${llmStats.fieldsAttempted} (${fillRate}%), estimated cost: $${estimatedCostUsd}`
      );
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[${PIPELINE_NAME}] Fatal error:`, err);
    throw err;
  } finally {
    await browser?.close();
    await db3.update(pipelineRuns).set({
      status: errorMessage ? "failed" : "succeeded",
      finishedAt: /* @__PURE__ */ new Date(),
      recordsProcessed: newCount + updatedCount,
      errorMessage
    }).where(eq3(pipelineRuns.id, runId));
  }
}

// src/jobs/scrape-rechtsformen.ts
import * as cheerio3 from "cheerio";
import { createHash as createHash3 } from "crypto";
import { db as db5, rechtsformen, gewerbeanmeldungInfo } from "@dataforge/db";
import { eq as eq5 } from "drizzle-orm";

// src/lib/base-scraper.ts
import { createHash as createHash2 } from "node:crypto";
import http from "node:http";
import https from "node:https";
import { chromium as chromium2 } from "playwright";
import { db as db4, pipelines as pipelines2, pipelineRuns as pipelineRuns2, scrapeIntegrityLog } from "@dataforge/db";
import { eq as eq4 } from "drizzle-orm";
var INTERMEDIARY_HEADERS = [
  "via",
  "x-cache",
  "x-cache-status",
  "cf-cache-status",
  // Cloudflare
  "x-amz-cf-id",
  // AWS CloudFront
  "x-varnish",
  // Varnish cache
  "x-forwarded-for",
  "x-proxy-cache",
  "age"
  // non-zero Age indicates cached response
];
var CAPTURED_HEADERS = [
  "date",
  "content-type",
  "server",
  "etag",
  "last-modified",
  "x-powered-by"
];
var BaseScraper = class {
  config;
  USER_AGENT = "Mozilla/5.0 (compatible; DataForge-Bot/1.0; +https://dataforge.io/bot)";
  constructor(config) {
    this.config = {
      requestDelayMs: 2500,
      maxRetries: 3,
      ...config
    };
  }
  // ─── Concrete utilities (usable by subclasses) ───────────────────────────────
  /** Produce a stable SHA-256 hex hash of arbitrary data (JSON-serialised). */
  contentHash(data) {
    return createHash2("sha256").update(JSON.stringify(data)).digest("hex");
  }
  /** Perform an HTTP HEAD request and return ETag / Last-Modified headers if present.
   *  Returns null on network errors — callers should treat null as "unknown freshness". */
  async checkFreshness(url) {
    try {
      const res = await fetch(url, {
        method: "HEAD",
        headers: { "User-Agent": this.USER_AGENT },
        signal: AbortSignal.timeout(1e4)
      });
      const etag = res.headers.get("etag") ?? void 0;
      const lastModified = res.headers.get("last-modified") ?? void 0;
      return { etag, lastModified };
    } catch {
      return null;
    }
  }
  /** Delay execution for the configured request delay. */
  sleep(ms) {
    return new Promise(
      (resolve) => setTimeout(resolve, ms ?? this.config.requestDelayMs)
    );
  }
  /** Navigate to a URL with retry logic. */
  async fetchWithRetry(page, url) {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await page.goto(url, { waitUntil: "networkidle", timeout: 3e4 });
        return;
      } catch (err) {
        if (attempt === this.config.maxRetries) throw err;
        console.warn(
          `[${this.config.pipelineName}][fetcher] Attempt ${attempt} failed for ${url}: ${err}. Retrying...`
        );
        await this.sleep(this.config.requestDelayMs * attempt);
      }
    }
  }
  // ─── Fetch integrity capture ──────────────────────────────────────────────────
  /**
   * Perform a raw HTTPS GET request to capture:
   * - SHA-256 hash of the raw response body (before any parsing)
   * - HTTP response headers (Date, Content-Type, Server, ETag)
   * - TLS certificate chain info (issuer, valid_from, valid_to)
   * - Intermediary signals (Via, X-Cache, CF-Cache-Status, etc.)
   *
   * Stores results in scrape_integrity_log. Never throws — failures are logged
   * and silently swallowed so they cannot disrupt the main scrape pipeline.
   */
  async captureIntegrity(url, pipelineRunId) {
    try {
      const result = await this._fetchIntegrityData(url);
      await db4.insert(scrapeIntegrityLog).values({
        sourceUrl: url,
        scrapedAt: /* @__PURE__ */ new Date(),
        responseHash: result.responseHash ?? void 0,
        httpStatus: result.httpStatus ?? void 0,
        httpHeaders: result.httpHeaders,
        tlsIssuer: result.tlsIssuer ?? void 0,
        tlsValidFrom: result.tlsValidFrom ?? void 0,
        tlsValidTo: result.tlsValidTo ?? void 0,
        intermediaryFlags: result.intermediaryFlags,
        hasIntermediary: result.hasIntermediary,
        pipelineRunId: pipelineRunId ?? void 0
      });
    } catch (err) {
      console.warn(
        `[${this.config.pipelineName}][integrity] Failed to capture integrity for ${url}: ${err}`
      );
    }
  }
  /** Internal: perform the raw HTTPS fetch and extract integrity metadata. */
  _fetchIntegrityData(url) {
    return new Promise((resolve) => {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === "https:";
      const options = {
        hostname: parsed.hostname,
        port: isHttps ? 443 : 80,
        path: parsed.pathname + parsed.search,
        method: "GET",
        headers: {
          "User-Agent": this.USER_AGENT,
          Accept: "text/html,application/xhtml+xml,*/*"
        },
        // Capture cert even if self-signed (we document, not reject)
        rejectUnauthorized: false,
        timeout: 15e3
      };
      const handler = (res) => {
        let tlsIssuer = null;
        let tlsValidFrom = null;
        let tlsValidTo = null;
        if (isHttps) {
          try {
            const socket = res.socket;
            const cert = socket.getPeerCertificate();
            if (cert && Object.keys(cert).length > 0) {
              tlsIssuer = cert.issuer?.O ?? cert.issuer?.CN ?? null;
              tlsValidFrom = cert.valid_from ?? null;
              tlsValidTo = cert.valid_to ?? null;
            }
          } catch {
          }
        }
        const httpHeaders = {};
        for (const key of CAPTURED_HEADERS) {
          const val = res.headers[key];
          if (val) httpHeaders[key] = Array.isArray(val) ? val[0] : val;
        }
        const intermediaryFlags = {};
        for (const key of INTERMEDIARY_HEADERS) {
          const val = res.headers[key];
          if (val) {
            intermediaryFlags[key] = Array.isArray(val) ? val[0] : val;
          }
        }
        const age = Number(res.headers["age"]);
        if (!isNaN(age) && age > 0) {
          intermediaryFlags["age"] = String(age);
        }
        const hasIntermediary = Object.keys(intermediaryFlags).length > 0;
        const hasher = createHash2("sha256");
        res.on("data", (chunk) => hasher.update(chunk));
        res.on("end", () => {
          resolve({
            responseHash: hasher.digest("hex"),
            httpStatus: res.statusCode ?? null,
            httpHeaders: Object.keys(httpHeaders).length > 0 ? httpHeaders : null,
            tlsIssuer,
            tlsValidFrom,
            tlsValidTo,
            intermediaryFlags: Object.keys(intermediaryFlags).length > 0 ? intermediaryFlags : null,
            hasIntermediary
          });
        });
        res.on("error", () => {
          resolve({
            responseHash: hasher.digest("hex"),
            httpStatus: res.statusCode ?? null,
            httpHeaders: Object.keys(httpHeaders).length > 0 ? httpHeaders : null,
            tlsIssuer,
            tlsValidFrom,
            tlsValidTo,
            intermediaryFlags: null,
            hasIntermediary: false
          });
        });
      };
      const req = isHttps ? https.request(options, handler) : http.request(options, handler);
      req.setTimeout(15e3, () => {
        req.destroy();
        resolve({
          responseHash: null,
          httpStatus: null,
          httpHeaders: null,
          tlsIssuer: null,
          tlsValidFrom: null,
          tlsValidTo: null,
          intermediaryFlags: null,
          hasIntermediary: false
        });
      });
      req.on("error", () => {
        resolve({
          responseHash: null,
          httpStatus: null,
          httpHeaders: null,
          tlsIssuer: null,
          tlsValidFrom: null,
          tlsValidTo: null,
          intermediaryFlags: null,
          hasIntermediary: false
        });
      });
      req.end();
    });
  }
  // ─── Pipeline tracking helpers ────────────────────────────────────────────────
  async ensurePipeline() {
    const existing = await db4.select({ id: pipelines2.id }).from(pipelines2).where(eq4(pipelines2.name, this.config.pipelineName)).limit(1);
    if (existing.length > 0) return existing[0].id;
    const inserted = await db4.insert(pipelines2).values({
      name: this.config.pipelineName,
      description: this.config.pipelineDescription,
      schedule: this.config.pipelineSchedule,
      enabled: true
    }).returning({ id: pipelines2.id });
    return inserted[0].id;
  }
  async startRun(pipelineId) {
    const [row] = await db4.insert(pipelineRuns2).values({ pipelineId, status: "running", startedAt: /* @__PURE__ */ new Date() }).returning({ id: pipelineRuns2.id });
    return row.id;
  }
  async finishRun(runId, stats, errorMessage) {
    await db4.update(pipelineRuns2).set({
      status: errorMessage ? "failed" : "succeeded",
      finishedAt: /* @__PURE__ */ new Date(),
      recordsProcessed: stats.recordsProcessed,
      errorMessage
    }).where(eq4(pipelineRuns2.id, runId));
  }
  // ─── Main run orchestrator ────────────────────────────────────────────────────
  /** Execute the full scrape pipeline. Returns aggregate run statistics. */
  async run() {
    const name = this.config.pipelineName;
    console.log(`[${name}] Pipeline starting`);
    const pipelineId = await this.ensurePipeline();
    const runId = await this.startRun(pipelineId);
    const stats = {
      recordsProcessed: 0,
      newCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      errorCount: 0
    };
    let fatalError = null;
    let browser = null;
    try {
      browser = await chromium2.launch({ headless: true });
      const context = await browser.newContext({ userAgent: this.USER_AGENT });
      const page = await context.newPage();
      const urls = await this.fetchUrls(page);
      console.log(`[${name}] Collected ${urls.length} URLs`);
      for (const url of urls) {
        try {
          await this.sleep();
          await this.fetchWithRetry(page, url);
          const html = await page.content();
          void this.captureIntegrity(url, runId);
          const record = this.parsePage(html, url);
          if (!record) continue;
          const diffResult = await this.diffRecord(record);
          if (diffResult === "unchanged") {
            stats.unchangedCount++;
            continue;
          }
          await this.writeRecord(record);
          stats.recordsProcessed++;
          if (diffResult === "new") stats.newCount++;
          else stats.updatedCount++;
        } catch (err) {
          stats.errorCount++;
          console.error(`[${name}] Failed to process ${url}:`, err);
        }
      }
      console.log(
        `[${name}] Completed \u2014 new: ${stats.newCount}, updated: ${stats.updatedCount}, unchanged: ${stats.unchangedCount}, errors: ${stats.errorCount}`
      );
    } catch (err) {
      fatalError = err instanceof Error ? err.message : String(err);
      console.error(`[${name}] Fatal error:`, err);
      throw err;
    } finally {
      await browser?.close();
      await this.finishRun(runId, stats, fatalError);
    }
    return stats;
  }
};

// src/jobs/scrape-rechtsformen.ts
var EXISTENZGRUENDUNGSPORTAL_BASE = "https://www.existenzgruendungsportal.de";
var RECHTSFORMEN_OVERVIEW = `${EXISTENZGRUENDUNGSPORTAL_BASE}/Navigation/DE/Gruendungswissen/Rechtsformen/rechtsformen`;
var KNOWN_RECHTSFORMEN = [
  { slug: "einzelunternehmen", name: "Einzelunternehmen", rowLabel: "einzelunternehmen" },
  { slug: "gbr", name: "GbR", fullName: "Gesellschaft b\xFCrgerlichen Rechts", rowLabel: "gbr" },
  // Page uses: "eingetragene Kauffrau (e.Kfr.) bzw. eingetragener Kaufmann (e.Kfm.)"
  { slug: "ek", name: "e.K.", fullName: "eingetragene Kauffrau / eingetragener Kaufmann", rowLabel: "eingetragenekauffrau" },
  { slug: "ohg", name: "OHG", fullName: "Offene Handelsgesellschaft", rowLabel: "ohg" },
  { slug: "kg", name: "KG", fullName: "Kommanditgesellschaft", rowLabel: "kg" },
  { slug: "gmbh", name: "GmbH", fullName: "Gesellschaft mit beschr\xE4nkter Haftung", rowLabel: "gmbh" },
  { slug: "ug", name: "UG (haftungsbeschr\xE4nkt)", fullName: "Unternehmergesellschaft (haftungsbeschr\xE4nkt)", rowLabel: "ug" },
  { slug: "ag", name: "AG", fullName: "Aktiengesellschaft", rowLabel: "ag" },
  { slug: "genossenschaft", name: "Genossenschaft (eG)", fullName: "eingetragene Genossenschaft", rowLabel: "genossenschaft" }
];
var CORE_DOCUMENTS = [
  "Personalausweis oder Reisepass",
  "Ausgef\xFClltes Gewerbeanmeldeformular",
  "Ggf. Erlaubnis / Genehmigung (bei erlaubnispflichtigen Gewerben)"
];
var BUNDESLAND_PORTALS = [
  {
    bundesland: "Baden-W\xFCrttemberg",
    url: "https://www.service-bw.de/zufi/leistungen/6000090",
    onlineAvailable: true,
    // service-bw.de offers online submission via BundID
    baseKostenEur: 26,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zust\xE4ndigen Gemeinde oder des Landkreises in Baden-W\xFCrttemberg"
  },
  {
    bundesland: "Bayern",
    url: "https://www.freistaat.bayern/dokumente/Behoerde/6060149",
    onlineAvailable: false,
    // most Bavarian municipalities still require in-person or postal
    baseKostenEur: 26,
    additionalDocuments: ["Bei Kapitalgesellschaften: Handelsregisterauszug (max. 3 Monate alt)"],
    zustaendigeStelleHint: "Gewerbeamt der zust\xE4ndigen Gemeinde oder des Landkreises in Bayern"
  },
  {
    bundesland: "Berlin",
    url: "https://service.berlin.de/dienstleistung/305249/",
    onlineAvailable: true,
    // service.berlin.de supports online registration
    baseKostenEur: 26,
    // fixed city-state rate per Berliner Gebührenordnung
    additionalDocuments: ["Aktuelle Meldebescheinigung (max. 3 Monate alt)"],
    zustaendigeStelleHint: "Bezirkliches Ordnungsamt (Gewerbeangelegenheiten) des zust\xE4ndigen Bezirks in Berlin"
  },
  {
    bundesland: "Brandenburg",
    url: "https://service.brandenburg.de/lis/detail.do?gsid=bb1.c.548660.de",
    onlineAvailable: false,
    baseKostenEur: 20,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zust\xE4ndigen Stadt oder des Landkreises in Brandenburg"
  },
  {
    bundesland: "Bremen",
    url: "https://www.service.bremen.de/gewerbeanmeldung",
    onlineAvailable: true,
    // Bremen integrates BundID for online Gewerbeanmeldung
    baseKostenEur: 26,
    additionalDocuments: [],
    zustaendigeStelleHint: "Ordnungsamt Bremen oder Bremerhaven"
  },
  {
    bundesland: "Hamburg",
    url: "https://www.hamburg.de/gewerbeanmeldung/",
    onlineAvailable: true,
    // Hamburg offers online registration via hamburgservice.de
    baseKostenEur: 35,
    // Hamburg Ordnungsamt rates are typically 30–56 EUR
    additionalDocuments: ["Aktuelle Meldebescheinigung"],
    zustaendigeStelleHint: "Bezirksamt (Gewerbeabteilung) des zust\xE4ndigen Bezirks in Hamburg"
  },
  {
    bundesland: "Hessen",
    url: "https://wirtschaft.hessen.de/wirtschaft-und-recht/gruendung/gewerbeanmeldung",
    onlineAvailable: false,
    baseKostenEur: 26,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zust\xE4ndigen Gemeinde oder des Landkreises in Hessen"
  },
  {
    bundesland: "Mecklenburg-Vorpommern",
    url: "https://www.service.mvnet.de/_php/download.php?datei_id=1597",
    onlineAvailable: false,
    baseKostenEur: 20,
    additionalDocuments: [],
    zustaendigeStelleHint: "Ordnungsamt der zust\xE4ndigen Gemeinde oder des Landkreises in Mecklenburg-Vorpommern"
  },
  {
    bundesland: "Niedersachsen",
    url: "https://www.niedersachsen.de/wirtschaft/existenzgruendung/gewerbeanmeldung",
    onlineAvailable: false,
    baseKostenEur: 20,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zust\xE4ndigen Gemeinde oder des Landkreises in Niedersachsen"
  },
  {
    bundesland: "Nordrhein-Westfalen",
    url: "https://www.nrw.de/leben-in-nrw/arbeit-wirtschaft/existenzgruendung/gewerbeanmeldung",
    onlineAvailable: true,
    // NRW OZG portal supports online submission in many municipalities
    baseKostenEur: 26,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zust\xE4ndigen Gemeinde oder des Kreises in Nordrhein-Westfalen"
  },
  {
    bundesland: "Rheinland-Pfalz",
    url: "https://www.rlp.de/wirtschaft/wirtschaft-und-finanzen/unternehmensgruendung/gewerbeanmeldung",
    onlineAvailable: false,
    baseKostenEur: 20,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zust\xE4ndigen Gemeinde oder des Landkreises in Rheinland-Pfalz"
  },
  {
    bundesland: "Saarland",
    url: "https://www.saarland.de/DE/portale/wirtschaft/service/beantragungen_genehmigungen/gewerbeanmeldung/gewerbeanmeldung_node.html",
    onlineAvailable: false,
    baseKostenEur: 25,
    additionalDocuments: [],
    zustaendigeStelleHint: "Ordnungsamt der zust\xE4ndigen Gemeinde im Saarland"
  },
  {
    bundesland: "Sachsen",
    url: "https://amt24.sachsen.de/leistung/detail/leistung/gewerbeanmeldung-gewerbeanzeige",
    onlineAvailable: false,
    baseKostenEur: 20,
    // Sächsisches Kostenverzeichnis sets baseline at 20 EUR
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zust\xE4ndigen Gemeinde oder des Landkreises in Sachsen"
  },
  {
    bundesland: "Sachsen-Anhalt",
    url: "https://www.investieren-in-sachsen-anhalt.de/gruenden-in-sachsen-anhalt/gewerbeanmeldung",
    onlineAvailable: false,
    baseKostenEur: 20,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zust\xE4ndigen Gemeinde oder des Landkreises in Sachsen-Anhalt"
  },
  {
    bundesland: "Schleswig-Holstein",
    url: "https://www.schleswig-holstein.de/DE/Landesregierung/Themen/Wirtschaft/Wirtschaft_Unternehmen/Gewerbeanmeldung/gewerbeanmeldung_node.html",
    onlineAvailable: false,
    baseKostenEur: 20,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zust\xE4ndigen Gemeinde oder des Kreises in Schleswig-Holstein"
  },
  {
    bundesland: "Th\xFCringen",
    url: "https://www.thueringen.de/wirtschaft/gruendung/gewerbeanmeldung/",
    onlineAvailable: false,
    baseKostenEur: 20,
    additionalDocuments: [],
    zustaendigeStelleHint: "Gewerbeamt der zust\xE4ndigen Gemeinde oder des Landkreises in Th\xFCringen"
  }
];
function makeHash(data) {
  return createHash3("sha256").update(JSON.stringify(data)).digest("hex");
}
function extractSection($, headingTexts) {
  const result = [];
  $("h2, h3, h4").each((_, el) => {
    const heading = $(el).text().trim().toLowerCase();
    if (!headingTexts.some((h) => heading.includes(h.toLowerCase()))) return;
    let next = $(el).next();
    while (next.length && !next.is("h2, h3, h4")) {
      const text = next.text().trim();
      if (text) result.push(text);
      next = next.next();
    }
  });
  return result.length > 0 ? result.join("\n\n") : null;
}
var RechtsformenScraper = class extends BaseScraper {
  constructor() {
    super({
      pipelineName: "scrape-rechtsformen",
      pipelineDescription: "Scrapes German legal entity types (Rechtsformen) from existenzgruender.de (BMWi/BMWK)",
      pipelineSchedule: "0 3 * * 1",
      // every Monday at 03:00 UTC
      requestDelayMs: 2e3
    });
  }
  async fetchUrls(_page) {
    return KNOWN_RECHTSFORMEN.map((rf) => `${RECHTSFORMEN_OVERVIEW}#${rf.slug}`);
  }
  parsePage(html, url) {
    const fragment = decodeURIComponent(url.split("#")[1] ?? "");
    const known = KNOWN_RECHTSFORMEN.find((rf) => rf.slug === fragment);
    if (!known) return null;
    const { slug, name: knownName, fullName: knownFullName, rowLabel } = known;
    const $ = cheerio3.load(html);
    let liabilityType = null;
    let minCapitalEur = null;
    let notaryRequired = null;
    let tradeRegisterRequired = null;
    let founderCount = null;
    const firstTable = $("table").first();
    let found = false;
    firstTable.find("tr").each((_, row) => {
      const cells = $(row).find("td, th");
      if (cells.length < 3) return;
      const firstCell = $(cells[0]).text().trim().replace(/\s+/g, " ");
      const normalized = firstCell.toLowerCase().replace(/[.()/\s]/g, "");
      if (!normalized.startsWith(rowLabel)) {
        return;
      }
      found = true;
      const capitalText = $(cells[1]).text().trim();
      if (/keines|kein\s/i.test(capitalText) || capitalText === "") {
        minCapitalEur = null;
      } else {
        const m = capitalText.match(/(\d[\d.,]*)\s*(?:Euro|EUR)/i);
        if (m) {
          const cleaned = m[1].replace(/\./g, "").replace(",", ".");
          const parsed = parseFloat(cleaned);
          if (!isNaN(parsed)) minCapitalEur = Math.round(parsed);
        }
      }
      if (cells.length > 2) founderCount = $(cells[2]).text().trim().substring(0, 64) || null;
      if (cells.length > 3) liabilityType = $(cells[3]).text().trim().substring(0, 256) || null;
      if (cells.length > 4) {
        const hrText = $(cells[4]).text().trim().toLowerCase();
        tradeRegisterRequired = /^ja/i.test(hrText) ? true : /^nein/i.test(hrText) ? false : null;
      }
      if (cells.length > 5) {
        const notaryText = $(cells[5]).text().trim().toLowerCase();
        notaryRequired = /^ja/i.test(notaryText) ? true : /^nein/i.test(notaryText) ? false : null;
      }
      return false;
    });
    if (!found) {
      console.warn(`[scrape-rechtsformen] Could not locate row for ${knownName} in comparison table`);
    }
    const descriptionParts = [];
    const proText = extractSection($, ["vorteile", "pro und contra", "vor- und nachteile"]);
    if (proText) descriptionParts.push(proText);
    if (descriptionParts.length === 0) {
      const mainText = $("main, article, .content").first().text().trim();
      if (mainText && mainText.length > 50) descriptionParts.push(mainText.substring(0, 2e3));
    }
    const descriptionDe = descriptionParts.join("\n\n") || null;
    if (minCapitalEur === null) {
      const pageText = $.text();
      const capitalMatch = pageText.match(
        new RegExp(`${knownName}[^\u20ACEUR]*?(?:Mindest(?:stamm|grund|kapital)|Stammkapital|Grundkapital)[^\\d]*(\\d[\\d.,]*)\\s*(?:Euro|EUR)`, "i")
      );
      if (capitalMatch) {
        const cleaned = capitalMatch[1].replace(/\./g, "").replace(",", ".");
        const parsed = parseFloat(cleaned);
        if (!isNaN(parsed)) minCapitalEur = Math.round(parsed);
      }
    }
    const contentHash = makeHash({
      slug,
      minCapitalEur,
      liabilityType,
      notaryRequired,
      tradeRegisterRequired,
      founderCount,
      descriptionDe
    });
    const sourceUrl = RECHTSFORMEN_OVERVIEW;
    return {
      name: knownName,
      slug,
      fullName: knownFullName ?? null,
      minCapitalEur,
      liabilityType,
      notaryRequired,
      tradeRegisterRequired,
      founderCount,
      descriptionDe,
      taxNotesDe: null,
      foundingCostsDe: null,
      sourceUrl,
      contentHash
    };
  }
  async diffRecord(record) {
    const existing = await db5.select({ id: rechtsformen.id, contentHash: rechtsformen.contentHash }).from(rechtsformen).where(eq5(rechtsformen.slug, record.slug)).limit(1);
    if (existing.length === 0) return "new";
    if (existing[0].contentHash === record.contentHash) return "unchanged";
    return "updated";
  }
  async writeRecord(record) {
    const now = /* @__PURE__ */ new Date();
    await db5.insert(rechtsformen).values({
      name: record.name,
      slug: record.slug,
      fullName: record.fullName,
      minCapitalEur: record.minCapitalEur,
      liabilityType: record.liabilityType,
      notaryRequired: record.notaryRequired,
      tradeRegisterRequired: record.tradeRegisterRequired,
      founderCount: record.founderCount,
      descriptionDe: record.descriptionDe,
      taxNotesDe: record.taxNotesDe,
      foundingCostsDe: record.foundingCostsDe,
      sourceUrl: record.sourceUrl,
      contentHash: record.contentHash,
      scrapedAt: now
    }).onConflictDoUpdate({
      target: rechtsformen.slug,
      set: {
        name: record.name,
        fullName: record.fullName,
        minCapitalEur: record.minCapitalEur,
        liabilityType: record.liabilityType,
        notaryRequired: record.notaryRequired,
        tradeRegisterRequired: record.tradeRegisterRequired,
        founderCount: record.founderCount,
        descriptionDe: record.descriptionDe,
        taxNotesDe: record.taxNotesDe,
        foundingCostsDe: record.foundingCostsDe,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
        updatedAt: now
      }
    });
  }
};
var GewerbeanmeldungScraper = class extends BaseScraper {
  constructor() {
    super({
      pipelineName: "scrape-gewerbeanmeldung",
      pipelineDescription: "Scrapes Gewerbeanmeldung requirements per Bundesland from official state service portals",
      pipelineSchedule: "0 3 * * 1",
      // every Monday at 03:00 UTC
      requestDelayMs: 2e3
    });
  }
  async fetchUrls(_page) {
    return BUNDESLAND_PORTALS.map((p) => p.url);
  }
  parsePage(html, url) {
    const urlBase = url.split("#")[0];
    const portal = BUNDESLAND_PORTALS.find((p) => p.url.split("#")[0] === urlBase);
    if (!portal) return null;
    const { bundesland } = portal;
    const $ = cheerio3.load(html);
    const pageText = $.text();
    let kostenEur = null;
    const feeMatch = pageText.match(
      /(?:Gebühr|Kosten|Entgelt|Verwaltungsgebühr)[^\d]{0,30}(\d{1,3})\s*(?:bis\s*\d+\s*)?(?:Euro|EUR)/i
    );
    if (feeMatch) {
      const parsed = parseInt(feeMatch[1], 10);
      if (parsed >= 5 && parsed <= 300) {
        kostenEur = parsed;
      }
    }
    if (kostenEur === null) kostenEur = portal.baseKostenEur;
    let bearbeitungszeitTage = null;
    const timeMatch = pageText.match(
      /(?:Bearbeitungszeit|bearbeit)[^\d]{0,20}(\d+)\s*(?:bis\s*\d+\s*)?(?:Tag|Werktag|Arbeitstag)/i
    );
    if (timeMatch) {
      bearbeitungszeitTage = parseInt(timeMatch[1], 10);
    } else {
      bearbeitungszeitTage = 3;
    }
    const onlineLower = pageText.toLowerCase();
    const pageSignalsOnline = onlineLower.includes("online beantragen") || onlineLower.includes("online stellen") || onlineLower.includes("digital beantragen") || onlineLower.includes("elektronisch einreichen") || onlineLower.includes("bundid");
    const onlineAvailable = pageSignalsOnline ? true : portal.onlineAvailable;
    const docSection = extractSection($, [
      "unterlagen",
      "ben\xF6tigte dokumente",
      "erforderliche unterlagen",
      "was ben\xF6tigen sie",
      "mitbringen"
    ]);
    let requiredDocuments;
    if (docSection) {
      const lines = docSection.split(/\n|•|·|-(?=\s)/).map((l) => l.trim()).filter((l) => l.length > 5 && l.length < 200);
      if (lines.length > 0) {
        requiredDocuments = lines;
      } else {
        requiredDocuments = [...CORE_DOCUMENTS, ...portal.additionalDocuments];
      }
    } else {
      requiredDocuments = [...CORE_DOCUMENTS, ...portal.additionalDocuments];
    }
    const zustaendigeStelleDescription = extractSection($, ["zust\xE4ndig", "zust\xE4ndige beh\xF6rde", "gewerbeamt", "ordnungsamt"]) ?? portal.zustaendigeStelleHint;
    const contentHash = makeHash({
      bundesland,
      requiredDocuments,
      kostenEur,
      bearbeitungszeitTage,
      onlineAvailable,
      zustaendigeStelleDescription
    });
    return {
      bundesland,
      zustaendigeStelleDescription,
      kostenEur,
      bearbeitungszeitTage,
      requiredDocuments,
      onlineAvailable,
      noteDe: null,
      sourceUrl: portal.url,
      // actual state-specific portal URL
      contentHash
    };
  }
  async diffRecord(record) {
    const existing = await db5.select({
      id: gewerbeanmeldungInfo.id,
      contentHash: gewerbeanmeldungInfo.contentHash
    }).from(gewerbeanmeldungInfo).where(eq5(gewerbeanmeldungInfo.bundesland, record.bundesland)).limit(1);
    if (existing.length === 0) return "new";
    if (existing[0].contentHash === record.contentHash) return "unchanged";
    return "updated";
  }
  async writeRecord(record) {
    const now = /* @__PURE__ */ new Date();
    await db5.insert(gewerbeanmeldungInfo).values({
      bundesland: record.bundesland,
      zustaendigeStelleDescription: record.zustaendigeStelleDescription,
      kostenEur: record.kostenEur,
      bearbeitungszeitTage: record.bearbeitungszeitTage,
      requiredDocuments: record.requiredDocuments,
      onlineAvailable: record.onlineAvailable,
      noteDe: record.noteDe,
      sourceUrl: record.sourceUrl,
      contentHash: record.contentHash,
      scrapedAt: now
    }).onConflictDoUpdate({
      target: gewerbeanmeldungInfo.bundesland,
      set: {
        zustaendigeStelleDescription: record.zustaendigeStelleDescription,
        kostenEur: record.kostenEur,
        bearbeitungszeitTage: record.bearbeitungszeitTage,
        requiredDocuments: record.requiredDocuments,
        onlineAvailable: record.onlineAvailable,
        noteDe: record.noteDe,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now
      }
    });
  }
};
async function scrapeRechtsformen() {
  const rechtsformenScraper = new RechtsformenScraper();
  const rechtsformenStats = await rechtsformenScraper.run();
  console.log(
    `[scrape-rechtsformen] Done \u2014 new: ${rechtsformenStats.newCount}, updated: ${rechtsformenStats.updatedCount}, unchanged: ${rechtsformenStats.unchangedCount}, errors: ${rechtsformenStats.errorCount}`
  );
  const gewerbeScraper = new GewerbeanmeldungScraper();
  const gewerbeStats = await gewerbeScraper.run();
  console.log(
    `[scrape-gewerbeanmeldung] Done \u2014 new: ${gewerbeStats.newCount}, updated: ${gewerbeStats.updatedCount}, unchanged: ${gewerbeStats.unchangedCount}, errors: ${gewerbeStats.errorCount}`
  );
}

// src/jobs/scrape-sozialversicherung.ts
import * as cheerio4 from "cheerio";
import { createHash as createHash4 } from "crypto";
import { db as db6, svContributionRates, svObligations } from "@dataforge/db";
import { eq as eq6 } from "drizzle-orm";
var DRV_BEITRAEGE_URL = "https://www.deutsche-rentenversicherung.de/DRV/DE/Experten/Zahlen-und-Fakten/Werte-der-Rentenversicherung/werte-der-rentenversicherung_node.html";
var GKV_BEITRAEGE_URL = "https://www.gkv-spitzenverband.de/krankenversicherung/beitraege/beitragssaetze/beitragssaetze.jsp";
var BA_BEITRAEGE_URL = "https://www.arbeitsagentur.de/datei/beitraege-zur-sozialversicherung_ba014364.pdf";
var MINIJOB_URL = "https://www.minijob-zentrale.de/DE/01_minijobs/02_gewerblich/02_was_zahlt_der_arbeitgeber/node.html";
var BMG_PFLEGE_URL = "https://www.bundesgesundheitsministerium.de/themen/pflege/pflegeversicherung-zahlen-und-fakten.html";
var BMAS_URL = "https://www.bmas.de/DE/Arbeit/Arbeitsrecht/arbeitsrecht.html";
function makeHash2(data) {
  return createHash4("sha256").update(JSON.stringify(data)).digest("hex");
}
function extractSection2($, headingTexts) {
  const result = [];
  $("h2, h3, h4").each((_, el) => {
    const heading = $(el).text().trim().toLowerCase();
    if (!headingTexts.some((h) => heading.includes(h.toLowerCase()))) return;
    let next = $(el).next();
    while (next.length && !next.is("h2, h3, h4")) {
      const text = next.text().trim();
      if (text) result.push(text);
      next = next.next();
    }
  });
  return result.length > 0 ? result.join("\n\n") : null;
}
function extractRate(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(
    `${escaped}[^\\d]{0,80}?(\\d{1,2}[,.]\\d{1,2})\\s*(?:Prozent|%)`,
    "i"
  );
  const m = text.match(re);
  if (m) return m[1].replace(",", ".") + "%";
  return null;
}
var BASELINE_RATES = [
  {
    insuranceType: "krankenversicherung",
    labelDe: "Gesetzliche Krankenversicherung (GKV)",
    rateTotal: "14.6%",
    rateEmployer: "7.3%",
    rateEmployee: "7.3%",
    notesDe: "Allgemeiner Beitragssatz nach \xA7 241 SGB V. Hinzu kommt ein einkommensabh\xE4ngiger Zusatzbeitrag (2025 avg. ca. 1.7%), der h\xE4lftig geteilt wird. Gesamtbelastung ca. 16.3%.",
    validFrom: "2025-01-01",
    sourceUrl: GKV_BEITRAEGE_URL
  },
  {
    insuranceType: "rentenversicherung",
    labelDe: "Gesetzliche Rentenversicherung (GRV)",
    rateTotal: "18.6%",
    rateEmployer: "9.3%",
    rateEmployee: "9.3%",
    notesDe: "Beitragssatz nach \xA7 158 SGB VI. Gilt bis zur Beitragsbemessungsgrenze (West 2025: 8.050 \u20AC/Monat, Ost: 7.450 \u20AC/Monat).",
    validFrom: "2025-01-01",
    sourceUrl: DRV_BEITRAEGE_URL
  },
  {
    insuranceType: "arbeitslosenversicherung",
    labelDe: "Arbeitslosenversicherung (ALV)",
    rateTotal: "2.6%",
    rateEmployer: "1.3%",
    rateEmployee: "1.3%",
    notesDe: "Beitragssatz nach \xA7 341 SGB III. Gilt bis zur Beitragsbemessungsgrenze der Rentenversicherung.",
    validFrom: "2025-01-01",
    sourceUrl: BA_BEITRAEGE_URL
  },
  {
    insuranceType: "pflegeversicherung",
    labelDe: "Soziale Pflegeversicherung (SPV)",
    rateTotal: "3.4%",
    rateEmployer: "1.7%",
    rateEmployee: "1.7%",
    notesDe: "Beitragssatz nach \xA7 55 SGB XI. Kinderlose Arbeitnehmer zahlen einen Zuschlag von 0.6%. In Sachsen tr\xE4gt der Arbeitgeber nur 1.2%, der Arbeitnehmer 2.2%.",
    validFrom: "2025-01-01",
    sourceUrl: BMG_PFLEGE_URL
  },
  {
    insuranceType: "minijob_pauschalbeitrag_kv",
    labelDe: "Minijob \u2013 Pauschalbeitrag Krankenversicherung",
    rateTotal: "13%",
    rateEmployer: "13%",
    rateEmployee: "0%",
    notesDe: "Pauschalabgabe f\xFCr geringf\xFCgig Besch\xE4ftigte bis 538 \u20AC/Monat (\xA7 249b SGB V). Nur vom Arbeitgeber getragen.",
    validFrom: "2025-01-01",
    sourceUrl: MINIJOB_URL
  },
  {
    insuranceType: "minijob_pauschalbeitrag_rv",
    labelDe: "Minijob \u2013 Pauschalbeitrag Rentenversicherung",
    rateTotal: "15%",
    rateEmployer: "15%",
    rateEmployee: "0%",
    notesDe: "Pauschalabgabe f\xFCr gewerbliche Minijobs bis 538 \u20AC/Monat (\xA7 172 SGB VI). Arbeitnehmer k\xF6nnen auf Rentenversicherungspflicht verzichten (Befreiung m\xF6glich), zahlen sonst Aufstockungsbeitrag auf 18.6%.",
    validFrom: "2025-01-01",
    sourceUrl: MINIJOB_URL
  }
];
var BASELINE_OBLIGATIONS = [
  {
    obligationType: "anmeldung_neuer_mitarbeiter",
    labelDe: "Anmeldung neuer Mitarbeiter",
    descriptionDe: "Arbeitgeber m\xFCssen neu eingestellte Arbeitnehmer bei der zust\xE4ndigen Krankenkasse zur Sozialversicherung anmelden. Die Anmeldung muss sp\xE4testens mit der ersten Lohn-/Gehaltsabrechnung, in jedem Fall aber innerhalb von 6 Wochen nach Besch\xE4ftigungsbeginn erfolgen.",
    descriptionEn: "Employers must register newly hired employees with their statutory health insurance fund (Krankenkasse) for social insurance purposes. Registration must be submitted with the first payroll run, at the latest within 6 weeks of the start of employment.",
    deadlineInfo: "Innerhalb von 6 Wochen nach Besch\xE4ftigungsbeginn (\xA7 28a SGB IV)",
    appliesTo: "Arbeitgeber",
    legalBasis: "\xA7 28a SGB IV",
    sourceUrl: "https://www.arbeitsagentur.de/unternehmen/personalfragen/meldepflichten"
  },
  {
    obligationType: "krankenkassenwahl",
    labelDe: "Krankenkassenwahl des Arbeitnehmers",
    descriptionDe: "Arbeitnehmer haben das Recht, ihre gesetzliche Krankenkasse frei zu w\xE4hlen (\xA7 173 SGB V). Der Arbeitgeber meldet den Arbeitnehmer bei der vom Arbeitnehmer gew\xE4hlten Krankenkasse an. W\xE4hlt der Arbeitnehmer keine Krankenkasse, kann der Arbeitgeber eine zuweisen. Die Krankenkasse ist gleichzeitig Einzugsstelle f\xFCr alle Sozialversicherungsbeitr\xE4ge.",
    descriptionEn: "Employees are free to choose their statutory health insurer (\xA7 173 SGB V). The employer registers the employee with the chosen Krankenkasse, which also collects all social insurance contributions.",
    deadlineInfo: null,
    appliesTo: "Arbeitgeber, Arbeitnehmer",
    legalBasis: "\xA7 173 SGB V",
    sourceUrl: BMAS_URL
  },
  {
    obligationType: "sozialversicherungsausweis",
    labelDe: "Sozialversicherungsausweis / Versicherungsnummer",
    descriptionDe: "Jeder versicherungspflichtige Arbeitnehmer erh\xE4lt eine lebenslange Sozialversicherungsnummer und einen Sozialversicherungsausweis. Arbeitgeber sind verpflichtet, die Versicherungsnummer bei Anmeldung anzugeben. Neue Mitarbeiter ohne Versicherungsnummer werden durch die Deutsche Rentenversicherung registriert.",
    descriptionEn: "Every employee subject to social insurance receives a lifelong social insurance number. Employers must provide this number when registering employees; new employees without a number are registered by Deutsche Rentenversicherung.",
    deadlineInfo: null,
    appliesTo: "Arbeitgeber",
    legalBasis: "\xA7 28a Abs. 3 SGB IV",
    sourceUrl: DRV_BEITRAEGE_URL
  },
  {
    obligationType: "minijob_regelungen",
    labelDe: "Minijob-Regelungen (geringf\xFCgige Besch\xE4ftigung)",
    descriptionDe: "Minijobs sind Besch\xE4ftigungen bis 538 \u20AC/Monat (seit Oktober 2022). Arbeitgeber zahlen Pauschalabgaben von 13% KV + 15% RV + 2% Pauschalsteuer (insgesamt ca. 31%). Arbeitnehmer sind von Krankenversicherungsbeitr\xE4gen befreit, bleiben aber rentenversicherungspflichtig (k\xF6nnen sich befreien lassen). F\xFCr Besch\xE4ftigungen zwischen 538,01 \u20AC und 2.000 \u20AC gilt die Gleitzonenregelung (\xDCbergangsbereich).",
    descriptionEn: "Minijobs cover employment up to 538 \u20AC/month. Employers pay flat-rate contributions (13% KV + 15% RV + 2% payroll tax, totalling ~31%). Employees are exempt from health insurance contributions but remain subject to pension insurance (exemption possible). Earnings between 538.01 \u20AC and 2,000 \u20AC fall under the sliding-scale zone (\xDCbergangsbereich).",
    deadlineInfo: null,
    appliesTo: "Arbeitgeber, Minijobber",
    legalBasis: "\xA7 8 SGB IV, \xA7 249b SGB V, \xA7 172 SGB VI",
    sourceUrl: MINIJOB_URL
  },
  {
    obligationType: "lohnfortzahlung_krankheitsfall",
    labelDe: "Lohnfortzahlung im Krankheitsfall",
    descriptionDe: "Arbeitgeber sind verpflichtet, erkrankten Arbeitnehmern f\xFCr bis zu 6 Wochen das volle Gehalt fortzuzahlen (Entgeltfortzahlungsgesetz, EFZG). Voraussetzung ist ein ununterbrochenes Arbeitsverh\xE4ltnis von mindestens 4 Wochen. Ab der 7. Woche zahlt die Krankenkasse Krankengeld (70% des Bruttolohns, max. 90% des Nettolohns).",
    descriptionEn: "Employers must continue paying full salary to sick employees for up to 6 weeks (Entgeltfortzahlungsgesetz). The employee must have been employed for at least 4 uninterrupted weeks. From week 7 onward, the Krankenkasse pays Krankengeld (70% of gross salary, max. 90% of net).",
    deadlineInfo: "Ab 1. Krankheitstag, max. 6 Wochen je Erkrankung",
    appliesTo: "Arbeitgeber",
    legalBasis: "\xA7 3 EFZG (Entgeltfortzahlungsgesetz)",
    sourceUrl: BMAS_URL
  },
  {
    obligationType: "urlaubsanspruch",
    labelDe: "Mindest-Urlaubsanspruch",
    descriptionDe: "Das Bundesurlaubsgesetz (BUrlG) garantiert jedem Arbeitnehmer mindestens 24 Werktage Urlaub pro Jahr bei einer 6-Tage-Woche (entspricht 20 Arbeitstagen bei 5-Tage-Woche). G\xFCnstigere tarifliche oder vertragliche Regelungen gehen vor. Der Urlaub ist grunds\xE4tzlich im laufenden Kalenderjahr zu gew\xE4hren und zu nehmen.",
    descriptionEn: "The Federal Leave Act (BUrlG) guarantees every employee at least 24 working days of annual leave on a 6-day week (equivalent to 20 working days on a 5-day week). More favourable collective or contractual arrangements take precedence.",
    deadlineInfo: "Im laufenden Kalenderjahr; \xDCbertragung bis 31. M\xE4rz m\xF6glich",
    appliesTo: "Arbeitgeber",
    legalBasis: "\xA7 3 BUrlG (Bundesurlaubsgesetz)",
    sourceUrl: BMAS_URL
  },
  {
    obligationType: "kuendigungsschutz_basics",
    labelDe: "K\xFCndigungsschutz (Grundlagen)",
    descriptionDe: "Das K\xFCndigungsschutzgesetz (KSchG) gilt f\xFCr Betriebe mit mehr als 10 Arbeitnehmern und nach 6-monatiger Betriebszugeh\xF6rigkeit. K\xFCndigungen m\xFCssen sozial gerechtfertigt sein (personen-, verhaltens- oder betriebsbedingt). F\xFCr besondere Personengruppen (Schwangere, Schwerbehinderte, Betriebsr\xE4te) gelten Sonderk\xFCndigungsschutzregeln.",
    descriptionEn: "The Dismissal Protection Act (KSchG) applies to companies with more than 10 employees and after 6 months of employment. Dismissals must be socially justified (personal, behavioural, or operational reasons). Special protection applies to pregnant employees, severely disabled persons, and works council members.",
    deadlineInfo: "Gilt ab 6 Monaten Betriebszugeh\xF6rigkeit",
    appliesTo: "Arbeitgeber",
    legalBasis: "\xA7 1 KSchG (K\xFCndigungsschutzgesetz)",
    sourceUrl: BMAS_URL
  },
  {
    obligationType: "selbststaendige_rv_pflicht",
    labelDe: "Rentenversicherungspflicht f\xFCr Selbstst\xE4ndige",
    descriptionDe: "Bestimmte Berufsgruppen von Selbstst\xE4ndigen unterliegen der gesetzlichen Rentenversicherungspflicht (\xA7 2 SGB VI), z. B. Handwerker, Lehrer, Erzieher, Pflegepersonen, K\xFCnstler und Publizisten (KSK), sowie Selbstst\xE4ndige mit nur einem Auftraggeber. Der Beitragssatz betr\xE4gt 18,6% des beitragspflichtigen Einkommens.",
    descriptionEn: "Certain categories of self-employed persons are compulsorily insured in the statutory pension scheme (\xA7 2 SGB VI), including craftspeople, teachers, nurses, artists and journalists (KSK), and the self-employed with a single client. The contribution rate is 18.6% of pensionable income.",
    deadlineInfo: "Meldung innerhalb von 3 Monaten nach Aufnahme der T\xE4tigkeit",
    appliesTo: "Selbstst\xE4ndige",
    legalBasis: "\xA7 2 SGB VI",
    sourceUrl: DRV_BEITRAEGE_URL
  }
];
var RATE_SOURCE_URLS = {
  krankenversicherung: GKV_BEITRAEGE_URL,
  rentenversicherung: DRV_BEITRAEGE_URL,
  arbeitslosenversicherung: BA_BEITRAEGE_URL,
  pflegeversicherung: BMG_PFLEGE_URL,
  minijob_pauschalbeitrag_kv: MINIJOB_URL,
  minijob_pauschalbeitrag_rv: MINIJOB_URL
};
var SvBeitraegeScraper = class extends BaseScraper {
  constructor() {
    super({
      pipelineName: "scrape-sv-beitraege",
      pipelineDescription: "Scrapes current German social insurance contribution rates from official primary sources (DRV, GKV-Spitzenverband, BA, BMG, Minijob-Zentrale)",
      pipelineSchedule: "0 4 * * 1",
      // every Monday at 04:00 UTC
      requestDelayMs: 2e3
    });
  }
  async fetchUrls(_page) {
    return Object.entries(RATE_SOURCE_URLS).map(
      ([type, url]) => `${url}#sv-type=${encodeURIComponent(type)}`
    );
  }
  parsePage(html, url) {
    const fragment = url.split("#sv-type=")[1];
    const insuranceType = fragment ? decodeURIComponent(fragment) : null;
    if (!insuranceType) return null;
    const baseline = BASELINE_RATES.find(
      (r) => r.insuranceType === insuranceType
    );
    if (!baseline) return null;
    const $ = cheerio4.load(html);
    const pageText = $.text();
    let rateTotal = baseline.rateTotal;
    let rateEmployer = baseline.rateEmployer;
    let rateEmployee = baseline.rateEmployee;
    if (insuranceType === "rentenversicherung") {
      const extracted = extractRate(pageText, "Rentenversicherung");
      if (extracted) rateTotal = extracted;
      if (rateTotal) {
        const num = parseFloat(rateTotal);
        if (!isNaN(num)) {
          rateEmployer = `${(num / 2).toFixed(1)}%`;
          rateEmployee = `${(num / 2).toFixed(1)}%`;
        }
      }
    } else if (insuranceType === "krankenversicherung") {
      const extracted = extractRate(pageText, "allgemeiner Beitragssatz");
      if (extracted) rateTotal = extracted;
    } else if (insuranceType === "arbeitslosenversicherung") {
      const extracted = extractRate(pageText, "Arbeitslosenversicherung");
      if (extracted) rateTotal = extracted;
    } else if (insuranceType === "pflegeversicherung") {
      const extracted = extractRate(pageText, "Pflegeversicherung");
      if (extracted) rateTotal = extracted;
    }
    const yearMatch = pageText.match(/(\d{4})/);
    const validFrom = yearMatch ? `${yearMatch[1]}-01-01` : baseline.validFrom;
    const noteSection = extractSection2($, ["hinweis", "zusatzbeitrag", "besonderheit"]) ?? baseline.notesDe;
    const record = {
      insuranceType,
      labelDe: baseline.labelDe,
      rateTotal,
      rateEmployer,
      rateEmployee,
      notesDe: noteSection ?? baseline.notesDe,
      validFrom,
      sourceUrl: baseline.sourceUrl
    };
    return {
      ...record,
      contentHash: makeHash2(record)
    };
  }
  async diffRecord(record) {
    const existing = await db6.select({
      id: svContributionRates.id,
      contentHash: svContributionRates.contentHash
    }).from(svContributionRates).where(eq6(svContributionRates.insuranceType, record.insuranceType)).limit(1);
    if (existing.length === 0) return "new";
    if (existing[0].contentHash === record.contentHash) return "unchanged";
    return "updated";
  }
  async writeRecord(record) {
    const now = /* @__PURE__ */ new Date();
    await db6.insert(svContributionRates).values({
      insuranceType: record.insuranceType,
      labelDe: record.labelDe,
      rateTotal: record.rateTotal,
      rateEmployer: record.rateEmployer,
      rateEmployee: record.rateEmployee,
      notesDe: record.notesDe,
      validFrom: record.validFrom,
      sourceUrl: record.sourceUrl,
      contentHash: record.contentHash,
      scrapedAt: now
    }).onConflictDoUpdate({
      target: svContributionRates.insuranceType,
      set: {
        labelDe: record.labelDe,
        rateTotal: record.rateTotal,
        rateEmployer: record.rateEmployer,
        rateEmployee: record.rateEmployee,
        notesDe: record.notesDe,
        validFrom: record.validFrom,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
        updatedAt: now
      }
    });
  }
};
var OBLIGATION_SOURCE_URLS = {
  anmeldung_neuer_mitarbeiter: "https://www.arbeitsagentur.de/unternehmen/personalfragen/meldepflichten#sv-obl=anmeldung_neuer_mitarbeiter",
  krankenkassenwahl: `${BMAS_URL}#sv-obl=krankenkassenwahl`,
  sozialversicherungsausweis: `${DRV_BEITRAEGE_URL}#sv-obl=sozialversicherungsausweis`,
  minijob_regelungen: `${MINIJOB_URL}#sv-obl=minijob_regelungen`,
  lohnfortzahlung_krankheitsfall: `${BMAS_URL}#sv-obl=lohnfortzahlung_krankheitsfall`,
  urlaubsanspruch: `${BMAS_URL}#sv-obl=urlaubsanspruch`,
  kuendigungsschutz_basics: `${BMAS_URL}#sv-obl=kuendigungsschutz_basics`,
  selbststaendige_rv_pflicht: `${DRV_BEITRAEGE_URL}#sv-obl=selbststaendige_rv_pflicht`
};
var SvPflichtenScraper = class extends BaseScraper {
  constructor() {
    super({
      pipelineName: "scrape-sv-pflichten",
      pipelineDescription: "Scrapes German employer obligations (Meldepflichten, Arbeitgeberpflichten) from bmas.bund.de, arbeitsagentur.de, and related primary sources",
      pipelineSchedule: "0 4 * * 1",
      // every Monday at 04:00 UTC
      requestDelayMs: 2e3
    });
  }
  async fetchUrls(_page) {
    return Object.values(OBLIGATION_SOURCE_URLS);
  }
  parsePage(html, url) {
    const oblMatch = url.match(/sv-obl=([^&]+)/);
    const obligationType = oblMatch ? decodeURIComponent(oblMatch[1]) : null;
    if (!obligationType) return null;
    const baseline = BASELINE_OBLIGATIONS.find(
      (o) => o.obligationType === obligationType
    );
    if (!baseline) return null;
    const $ = cheerio4.load(html);
    const liveSection = extractSection2($, [
      "meldepflicht",
      "anmeldung",
      "krankenversicherung",
      "urlaubsanspruch",
      "lohnfortzahlung",
      "k\xFCndigungsschutz",
      "rentenversicherungspflicht",
      "minijob"
    ]) ?? null;
    const descriptionDe = liveSection && liveSection.length > 100 ? liveSection : baseline.descriptionDe;
    const record = {
      obligationType,
      labelDe: baseline.labelDe,
      descriptionDe,
      descriptionEn: baseline.descriptionEn,
      deadlineInfo: baseline.deadlineInfo,
      appliesTo: baseline.appliesTo,
      legalBasis: baseline.legalBasis,
      sourceUrl: baseline.sourceUrl
    };
    return {
      ...record,
      contentHash: makeHash2(record)
    };
  }
  async diffRecord(record) {
    const existing = await db6.select({
      id: svObligations.id,
      contentHash: svObligations.contentHash
    }).from(svObligations).where(eq6(svObligations.obligationType, record.obligationType)).limit(1);
    if (existing.length === 0) return "new";
    if (existing[0].contentHash === record.contentHash) return "unchanged";
    return "updated";
  }
  async writeRecord(record) {
    const now = /* @__PURE__ */ new Date();
    await db6.insert(svObligations).values({
      obligationType: record.obligationType,
      labelDe: record.labelDe,
      descriptionDe: record.descriptionDe,
      descriptionEn: record.descriptionEn,
      deadlineInfo: record.deadlineInfo,
      appliesTo: record.appliesTo,
      legalBasis: record.legalBasis,
      sourceUrl: record.sourceUrl,
      contentHash: record.contentHash,
      scrapedAt: now
    }).onConflictDoUpdate({
      target: svObligations.obligationType,
      set: {
        labelDe: record.labelDe,
        descriptionDe: record.descriptionDe,
        descriptionEn: record.descriptionEn,
        deadlineInfo: record.deadlineInfo,
        appliesTo: record.appliesTo,
        legalBasis: record.legalBasis,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
        updatedAt: now
      }
    });
  }
};
async function scrapeSozialversicherung() {
  const beitraegeScraper = new SvBeitraegeScraper();
  const beitraegeStats = await beitraegeScraper.run();
  console.log(
    `[scrape-sv-beitraege] Done \u2014 new: ${beitraegeStats.newCount}, updated: ${beitraegeStats.updatedCount}, unchanged: ${beitraegeStats.unchangedCount}, errors: ${beitraegeStats.errorCount}`
  );
  const pflichtenScraper = new SvPflichtenScraper();
  const pflichtenStats = await pflichtenScraper.run();
  console.log(
    `[scrape-sv-pflichten] Done \u2014 new: ${pflichtenStats.newCount}, updated: ${pflichtenStats.updatedCount}, unchanged: ${pflichtenStats.unchangedCount}, errors: ${pflichtenStats.errorCount}`
  );
}

// src/jobs/scrape-steuern.ts
import * as cheerio5 from "cheerio";
import { createHash as createHash5 } from "crypto";
import { db as db7, taxObligations, taxDeadlines } from "@dataforge/db";
import { and as and2, eq as eq7 } from "drizzle-orm";
var BMF_STEUERN_URL = "https://www.bundesfinanzministerium.de/Web/DE/Themen/Steuern/steuern.html";
var ELSTER_URL = "https://www.elster.de/eportal/helpGlobal?themaGlobal=hilfe_registrierung";
var BUNDESRAT_GEWERBESTEUER_URL = "https://www.bundesrat.de/DE/themen/steuern/steuern-node.html";
function makeHash3(data) {
  return createHash5("sha256").update(JSON.stringify(data)).digest("hex");
}
function extractSection3($, headingTexts) {
  const result = [];
  $("h2, h3, h4").each((_, el) => {
    const heading = $(el).text().trim().toLowerCase();
    if (!headingTexts.some((h) => heading.includes(h.toLowerCase()))) return;
    let next = $(el).next();
    while (next.length && !next.is("h2, h3, h4")) {
      const text = next.text().trim();
      if (text) result.push(text);
      next = next.next();
    }
  });
  return result.length > 0 ? result.join("\n\n") : null;
}
var BASELINE_OBLIGATIONS2 = [
  // ── Körperschaftsteuer (GmbH, UG) ─────────────────────────────────────────
  {
    rechtsformSlug: "gmbh",
    taxType: "koerperschaftsteuer",
    labelDe: "K\xF6rperschaftsteuer",
    descriptionDe: "Kapitalgesellschaften (GmbH, UG) unterliegen der K\xF6rperschaftsteuer (KSt) auf ihren zu versteuernden Gewinn. Der Steuersatz betr\xE4gt einheitlich 15% (\xA7 23 Abs. 1 KStG) zzgl. 5,5% Solidarit\xE4tszuschlag auf die KSt-Schuld (effektiv 15,825%). Die Steuer wird quartalsweise als Vorauszahlung (10. M\xE4rz, 10. Juni, 10. September, 10. Dezember) und j\xE4hrlich mit der K\xF6rperschaftsteuererkl\xE4rung abgerechnet. Steuersubjekt ist die Kapitalgesellschaft, nicht die Gesellschafter.",
    descriptionEn: "Limited liability companies (GmbH, UG) are subject to corporate income tax (K\xF6rperschaftsteuer) on their taxable profit at a flat rate of 15% (\xA7 23 para. 1 KStG) plus 5.5% solidarity surcharge on the tax amount (effective rate 15.825%). Tax is paid quarterly as advance payments and settled annually via the corporate tax return. The taxable entity is the company, not its shareholders.",
    rateInfo: "15% zzgl. 5,5% Solidarit\xE4tszuschlag (effektiv 15,825%)",
    filingFrequency: "j\xE4hrlich (Vorauszahlungen quartalsweise)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "\xA7 23 Abs. 1 KStG (K\xF6rperschaftsteuergesetz)",
    sourceUrl: BMF_STEUERN_URL
  },
  {
    rechtsformSlug: "ug",
    taxType: "koerperschaftsteuer",
    labelDe: "K\xF6rperschaftsteuer",
    descriptionDe: "Die UG (haftungsbeschr\xE4nkt) ist wie die GmbH eine Kapitalgesellschaft und unterliegt der K\xF6rperschaftsteuer mit 15% (\xA7 23 Abs. 1 KStG) zzgl. Solidarit\xE4tszuschlag. Besonderheit: Die UG muss mindestens 25% ihres Jahres\xFCberschusses als gesetzliche R\xFCcklage einbehalten, bis das Mindeststammkapital der GmbH (25.000 \u20AC) erreicht ist (\xA7 5a GmbHG). Diese R\xFCcklage mindert nicht die Steuerpflicht.",
    descriptionEn: "The UG (haftungsbeschr\xE4nkt) is a limited liability company like the GmbH and is subject to corporate income tax at 15% (\xA7 23 para. 1 KStG) plus solidarity surcharge. Special rule: the UG must retain at least 25% of its annual surplus as a statutory reserve until the GmbH minimum share capital (\u20AC25,000) is reached (\xA7 5a GmbHG). This reserve does not reduce the tax liability.",
    rateInfo: "15% zzgl. 5,5% Solidarit\xE4tszuschlag (effektiv 15,825%)",
    filingFrequency: "j\xE4hrlich (Vorauszahlungen quartalsweise)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "\xA7 23 Abs. 1 KStG, \xA7 5a GmbHG",
    sourceUrl: BMF_STEUERN_URL
  },
  // ── Einkommensteuer (Einzelunternehmen, Freiberufler, GbR) ────────────────
  {
    rechtsformSlug: "einzelunternehmen",
    taxType: "einkommensteuer",
    labelDe: "Einkommensteuer",
    descriptionDe: "Einzelunternehmer versteuern ihren Gewinn als Teil ihres pers\xF6nlichen Einkommens \xFCber die Einkommensteuer (EStG). Der Gewinn z\xE4hlt zu den Eink\xFCnften aus Gewerbebetrieb (\xA7 15 EStG) oder aus selbstst\xE4ndiger Arbeit (\xA7 18 EStG). Der progressive Steuersatz betr\xE4gt 0% bis 45% (Reichensteuersatz ab 277.826 \u20AC, 2025). Hinzu kommen 5,5% Solidarit\xE4tszuschlag (ab 18.130 \u20AC Einkommensteuerschuld). Vorauszahlungen sind quartalsweise f\xE4llig (10. M\xE4rz, 10. Juni, 10. September, 10. Dezember).",
    descriptionEn: "Sole traders (Einzelunternehmer) are taxed on their business profit as part of their personal income via Einkommensteuer (EStG). Profit from a trade counts as income from business operations (\xA7 15 EStG) or from self-employment (\xA7 18 EStG). The progressive rate ranges from 0% to 45% (top rate above \u20AC277,826 in 2025), plus 5.5% solidarity surcharge above a threshold. Quarterly advance payments apply.",
    rateInfo: "0%\u201345% progressiv (zzgl. 5,5% Solidarit\xE4tszuschlag ab Schwellenwert)",
    filingFrequency: "j\xE4hrlich (Vorauszahlungen quartalsweise)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "\xA7 15 EStG (Gewerbebetrieb), \xA7 18 EStG (Selbstst\xE4ndige)",
    sourceUrl: BMF_STEUERN_URL
  },
  {
    rechtsformSlug: "freiberufler",
    taxType: "einkommensteuer",
    labelDe: "Einkommensteuer",
    descriptionDe: "Freiberufler (\xA7 18 EStG: \xC4rzte, Anw\xE4lte, Architekten, Ingenieure, Journalisten, K\xFCnstler u. a.) versteuern ihren Gewinn als Eink\xFCnfte aus selbstst\xE4ndiger Arbeit. Kein Gewerbebetrieb \u2014 daher kein Gewerbesteuerrecht anwendbar (keine Gewerbeanmeldung, keine Gewerbesteuer). Der progressive Einkommensteuersatz gilt wie beim Einzelunternehmer (0%\u201345%). Gewinnermittlung durch Einnahmen-\xDCberschuss-Rechnung (E\xDCR) oder Bilanzierung (wenn freiwillig oder durch Sonderrecht verpflichtend).",
    descriptionEn: "Freelancers (\xA7 18 EStG: doctors, lawyers, architects, journalists, artists, etc.) are taxed on income from self-employment. No trade classification \u2014 therefore no trade tax (Gewerbesteuer) applies (no Gewerbeanmeldung needed, no Gewerbesteuer). The same progressive income tax rate applies (0%\u201345%). Profit can be determined by cash-basis accounting (E\xDCR) or accrual accounting.",
    rateInfo: "0%\u201345% progressiv (zzgl. 5,5% Solidarit\xE4tszuschlag ab Schwellenwert)",
    filingFrequency: "j\xE4hrlich (Vorauszahlungen quartalsweise)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "\xA7 18 EStG (Eink\xFCnfte aus selbstst\xE4ndiger Arbeit)",
    sourceUrl: BMF_STEUERN_URL
  },
  {
    rechtsformSlug: "gbr",
    taxType: "einkommensteuer",
    labelDe: "Einkommensteuer (Mitunternehmerschaft)",
    descriptionDe: "Die GbR ist steuerlich transparent: Sie ist kein eigenes Steuersubjekt f\xFCr die Einkommensteuer. Die Gewinne werden durch gesonderte und einheitliche Feststellung (\xA7 180 AO) ermittelt und den Gesellschaftern entsprechend ihrer Beteiligungsquote zugerechnet. Jeder Gesellschafter versteuert seinen Anteil im Rahmen seiner pers\xF6nlichen Einkommensteuererkl\xE4rung. Eine Gewerbe-GbR unterliegt dabei dem \xA7 15 EStG, eine freiberufliche GbR dem \xA7 18 EStG.",
    descriptionEn: "The GbR is fiscally transparent: it is not a taxable entity for income tax purposes. Profits are determined by joint and uniform assessment (\xA7 180 AO) and allocated to partners according to their participation ratio. Each partner reports their share in their personal income tax return. A commercial GbR falls under \xA7 15 EStG; a freelance GbR under \xA7 18 EStG.",
    rateInfo: "Pers\xF6nlicher Steuersatz jedes Gesellschafters (0%\u201345%)",
    filingFrequency: "j\xE4hrlich pro Gesellschafter (gesonderte Feststellung)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "\xA7 15 / \xA7 18 EStG, \xA7 180 AO (gesonderte und einheitliche Feststellung)",
    sourceUrl: BMF_STEUERN_URL
  },
  // ── Gewerbesteuer (Gewerbebetriebe) ───────────────────────────────────────
  {
    rechtsformSlug: "gmbh",
    taxType: "gewerbesteuer",
    labelDe: "Gewerbesteuer",
    descriptionDe: "Kapitalgesellschaften (GmbH, UG) sind stets gewerblich t\xE4tig und unterliegen uneingeschr\xE4nkt der Gewerbesteuer (\xA7 2 Abs. 2 GewStG). Basis ist der Gewerbeertrag, der mit der Steuermesszahl von 3,5% multipliziert wird (\xA7 11 Abs. 2 GewStG). Dieser Messbetrag wird mit dem Hebesatz der Gemeinde multipliziert. Bundesweiter Mindest-Hebesatz: 200% (\xA7 16 Abs. 4 GewStG). Effektiver GewSt-Satz in deutschen Gro\xDFst\xE4dten: ca. 14%\u201317%. Freibetrag f\xFCr Kapitalgesellschaften: keiner.",
    descriptionEn: "Capital companies (GmbH, UG) are always classified as commercial enterprises and are subject to full trade tax (\xA7 2 para. 2 GewStG). The tax base is the trade income, multiplied by the standard tax index rate of 3.5% (\xA7 11 para. 2 GewStG), then by the municipality's Hebesatz. Minimum Hebesatz nationwide: 200% (\xA7 16 para. 4 GewStG). Effective rate in German cities: approx. 14%\u201317%. No tax-free allowance for capital companies.",
    rateInfo: "Steuermesszahl 3,5% \xD7 Hebesatz der Gemeinde (mind. 200%)",
    filingFrequency: "j\xE4hrlich (Vorauszahlungen quartalsweise)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "\xA7 2 Abs. 2 GewStG, \xA7 11 Abs. 2 GewStG",
    sourceUrl: BUNDESRAT_GEWERBESTEUER_URL
  },
  {
    rechtsformSlug: "ug",
    taxType: "gewerbesteuer",
    labelDe: "Gewerbesteuer",
    descriptionDe: "Die UG (haftungsbeschr\xE4nkt) unterliegt wie die GmbH der Gewerbesteuer ohne Freibetrag (\xA7 2 Abs. 2 GewStG). Steuermesszahl 3,5% \xD7 Hebesatz der Gemeinde. Da UGs oft in der Anfangsphase geringe Gewinne haben, kann die Gewerbesteuerlast anf\xE4nglich niedrig sein, besteht aber ab dem ersten Gewinn.",
    descriptionEn: "The UG (haftungsbeschr\xE4nkt) is subject to trade tax without a tax-free allowance (\xA7 2 para. 2 GewStG), like the GmbH. Tax index 3.5% \xD7 municipal Hebesatz. Since UGs often have small profits in early stages, the initial trade tax burden may be low but applies from the first profit.",
    rateInfo: "Steuermesszahl 3,5% \xD7 Hebesatz der Gemeinde (mind. 200%)",
    filingFrequency: "j\xE4hrlich (Vorauszahlungen quartalsweise)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "\xA7 2 Abs. 2 GewStG",
    sourceUrl: BUNDESRAT_GEWERBESTEUER_URL
  },
  {
    rechtsformSlug: "einzelunternehmen",
    taxType: "gewerbesteuer",
    labelDe: "Gewerbesteuer",
    descriptionDe: "Einzelunternehmer, die ein Gewerbe betreiben (nicht Freiberufler), unterliegen der Gewerbesteuer. Gewerbesteuerlicher Freibetrag f\xFCr nat\xFCrliche Personen: 24.500 \u20AC (\xA7 11 Abs. 1 Satz 3 Nr. 1 GewStG). Die Gewerbesteuer mindert die Einkommensteuerbelastung, da sie (pauschal mit dem 4-fachen Gewerbesteuermessbetrag) auf die Einkommensteuer angerechnet wird (\xA7 35 EStG). In der Praxis wird Gewerbesteuer bei kleinen Einzelunternehmen h\xE4ufig vollst\xE4ndig durch \xA7 35 EStG kompensiert.",
    descriptionEn: "Sole traders operating a commercial business (not freelancers) are subject to trade tax. The tax-free allowance for natural persons is \u20AC24,500 (\xA7 11 para. 1 sentence 3 No. 1 GewStG). Trade tax reduces the income tax burden because it is credited (at 4\xD7 the trade tax index) against income tax (\xA7 35 EStG). In practice, trade tax for small sole traders is often fully offset by \xA7 35 EStG.",
    rateInfo: "Steuermesszahl 3,5% \xD7 Hebesatz; Freibetrag 24.500 \u20AC; Anrechnung nach \xA7 35 EStG",
    filingFrequency: "j\xE4hrlich (Vorauszahlungen quartalsweise)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "\xA7 11 Abs. 1 GewStG, \xA7 35 EStG",
    sourceUrl: BUNDESRAT_GEWERBESTEUER_URL
  },
  {
    rechtsformSlug: "freiberufler",
    taxType: "gewerbesteuer",
    labelDe: "Gewerbesteuer (nicht anwendbar)",
    descriptionDe: "Freiberufler (\xA7 18 EStG) betreiben keinen Gewerbebetrieb im Sinne des \xA7 15 EStG und unterliegen daher nicht der Gewerbesteuer (\xA7 2 GewStG). Voraussetzung ist die Aus\xFCbung eines der in \xA7 18 Abs. 1 Nr. 1 EStG genannten Katalogberufe (\xC4rzte, Rechtsanw\xE4lte, Architekten, Ingenieure, Steuerberater, Journalisten, K\xFCnstler u. a.) oder eines diesen \xE4hnlichen Berufs. Keine Gewerbesteuerpflicht bedeutet auch keine Gewerbeanmeldung beim Gewerbeamt.",
    descriptionEn: "Freelancers (\xA7 18 EStG) do not operate a commercial business (Gewerbebetrieb) within the meaning of \xA7 15 EStG and are therefore not subject to trade tax (\xA7 2 GewStG). This applies to the regulated professions listed in \xA7 18 para. 1 No. 1 EStG (doctors, lawyers, architects, engineers, tax advisors, journalists, artists, etc.) or similar professions. No trade tax liability also means no Gewerbeanmeldung.",
    rateInfo: "Nicht anwendbar \u2014 keine Gewerbesteuerpflicht",
    filingFrequency: null,
    registrationRequired: false,
    kleinunternehmerRelevant: false,
    legalBasis: "\xA7 18 EStG, \xA7 2 GewStG",
    sourceUrl: BUNDESRAT_GEWERBESTEUER_URL
  },
  {
    rechtsformSlug: "gbr",
    taxType: "gewerbesteuer",
    labelDe: "Gewerbesteuer (nur bei Gewerbe-GbR)",
    descriptionDe: "Eine gewerbliche GbR unterliegt als solche der Gewerbesteuer (\xA7 5 Abs. 1 GewStG). Freibetrag: 24.500 \u20AC wie beim Einzelunternehmer. Gewerbesteuer wird auf die Einkommensteuer der Gesellschafter nach \xA7 35 EStG angerechnet. Eine freiberufliche GbR (alle Gesellschafter sind Freiberufler nach \xA7 18 EStG) unterliegt nicht der Gewerbesteuer \u2014 dies ist bei gemischten Gesellschaften (freiberuflich + gewerblich) zu pr\xFCfen (sog. Abf\xE4rberegelung \xA7 15 Abs. 3 EStG).",
    descriptionEn: "A commercial GbR is subject to trade tax as an entity (\xA7 5 para. 1 GewStG). Tax-free allowance: \u20AC24,500. Trade tax is credited against each partner's income tax via \xA7 35 EStG. A freelance GbR (all partners are freelancers per \xA7 18 EStG) is not subject to trade tax \u2014 mixed partnerships (partly commercial, partly freelance) must check the contamination rule (Abf\xE4rberegelung, \xA7 15 para. 3 EStG).",
    rateInfo: "Steuermesszahl 3,5% \xD7 Hebesatz; Freibetrag 24.500 \u20AC; Anrechnung \xA7 35 EStG",
    filingFrequency: "j\xE4hrlich (wenn gewerbesteuerpflichtig)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "\xA7 5 GewStG, \xA7 15 Abs. 3 EStG (Abf\xE4rberegelung)",
    sourceUrl: BUNDESRAT_GEWERBESTEUER_URL
  },
  // ── Umsatzsteuer (alle Rechtsformen) ──────────────────────────────────────
  {
    rechtsformSlug: "all",
    taxType: "umsatzsteuer",
    labelDe: "Umsatzsteuer (USt / Mehrwertsteuer)",
    descriptionDe: "Alle Unternehmer (unabh\xE4ngig von der Rechtsform) sind grunds\xE4tzlich umsatzsteuerpflichtig, sofern sie nachhaltig Lieferungen und Leistungen gegen Entgelt erbringen (\xA7 1 UStG). Regelsatz: 19%, erm\xE4\xDFigter Satz: 7% (\xA7 12 UStG). Ausnahme: Kleinunternehmerregelung nach \xA7 19 UStG (Umsatz \u2264 25.000 \u20AC im Vorjahr, \u2264 100.000 \u20AC im laufenden Jahr ab 2025). Die Anmeldung beim Finanzamt erfolgt \xFCber den Fragebogen zur steuerlichen Erfassung (ELSTER). F\xFCr grenz\xFCberschreitende Leistungen gilt das Bestimmungslandprinzip (\xA7\xA7 3a\u20133d UStG).",
    descriptionEn: "All entrepreneurs (regardless of legal form) are generally subject to VAT (Umsatzsteuer) if they sustainably supply goods or services for consideration (\xA7 1 UStG). Standard rate: 19%; reduced rate: 7% (\xA7 12 UStG). Exception: small business exemption under \xA7 19 UStG (turnover \u2264 \u20AC25,000 in the prior year, \u2264 \u20AC100,000 in the current year from 2025). Registration with the Finanzamt is done via the online registration form (ELSTER). Cross-border supplies follow the destination principle (\xA7\xA7 3a\u20133d UStG).",
    rateInfo: "19% (Regelsatz) / 7% (erm\xE4\xDFigter Satz); Kleinunternehmer: befreit",
    filingFrequency: "monatlich oder quartalsweise (Voranmeldung); j\xE4hrlich (Jahreserkl\xE4rung)",
    registrationRequired: true,
    kleinunternehmerRelevant: true,
    legalBasis: "\xA7 1 UStG, \xA7 12 UStG, \xA7 19 UStG (Kleinunternehmerregelung)",
    sourceUrl: ELSTER_URL
  },
  // ── Kleinunternehmerregelung ───────────────────────────────────────────────
  {
    rechtsformSlug: "all",
    taxType: "kleinunternehmerregelung",
    labelDe: "Kleinunternehmerregelung (\xA7 19 UStG)",
    descriptionDe: "Unternehmer mit einem Vorjahresumsatz bis 25.000 \u20AC (netto) und einem voraussichtlichen Umsatz im laufenden Jahr bis 100.000 \u20AC (ab 2025; vorher 50.000 \u20AC) k\xF6nnen die Kleinunternehmerregelung in Anspruch nehmen. Folge: keine Umsatzsteuerausweis auf Rechnungen, keine Abf\xFChrung von USt, kein Vorsteuerabzug. Vorteile: geringerer Verwaltungsaufwand, g\xFCnstigere Preise f\xFCr Privatpersonen. Nachteile: kein Vorsteuerabzug (ung\xFCnstig bei hohen Vorleistungen), Brutto-Einnahmen sind Umsatzgrenze. Die Regelung gilt f\xFCr alle Rechtsformen, ausgenommen Kapitalgesellschaften (GmbH/UG) sind theoretisch eingeschlossen, aber praktisch selten relevant. Wahlm\xF6glichkeit zur Regelbesteuerung (Option nach \xA7 19 Abs. 2 UStG, 5-Jahres-Bindung).",
    descriptionEn: "Entrepreneurs with prior-year turnover up to \u20AC25,000 (net) and expected current-year turnover up to \u20AC100,000 (from 2025; previously \u20AC50,000) may use the small business exemption. Effect: no VAT on invoices, no VAT remittance, no input tax deduction. Advantages: lower administrative burden, lower prices for private customers. Disadvantages: no input tax recovery (unfavourable with high input costs). Threshold based on gross receipts. The option to elect standard VAT treatment is available (\xA7 19 para. 2 UStG, 5-year binding).",
    rateInfo: "Keine USt (Umsatz \u2264 25.000 \u20AC Vorjahr + \u2264 100.000 \u20AC lfd. Jahr, ab 2025)",
    filingFrequency: "keine Voranmeldung (Jahreserkl\xE4rung empfohlen)",
    registrationRequired: true,
    kleinunternehmerRelevant: true,
    legalBasis: "\xA7 19 UStG",
    sourceUrl: ELSTER_URL
  },
  // ── Lohnsteuer (alle Arbeitgeber) ─────────────────────────────────────────
  {
    rechtsformSlug: "all",
    taxType: "lohnsteuer",
    labelDe: "Lohnsteuer",
    descriptionDe: "Unternehmer, die Arbeitnehmer besch\xE4ftigen, sind verpflichtet, Lohnsteuer einzubehalten und monatlich an das Finanzamt abzuf\xFChren (\xA7 38 EStG). Die Lohnsteuer-Anmeldung erfolgt elektronisch \xFCber ELSTER. F\xE4lligkeit: 10. des Folgemonats (monatlich), 10. April / 10. Juli / 10. Oktober / 10. Januar (quartalsweise bei < 5.000 \u20AC Lohnsteuer p.a.), j\xE4hrlich bei < 1.100 \u20AC Lohnsteuer p.a. Hinzu kommt der Solidarit\xE4tszuschlag (5,5% der Lohnsteuer) und ggf. Kirchensteuer. Arbeitgeber haften f\xFCr korrekte Einbehaltung und Abf\xFChrung.",
    descriptionEn: "Employers must withhold payroll tax (Lohnsteuer) from employees' wages and remit it monthly to the Finanzamt (\xA7 38 EStG). Filing is done electronically via ELSTER. Due date: 10th of the following month (monthly); quarterly if annual payroll tax < \u20AC5,000; annually if < \u20AC1,100. Solidarity surcharge (5.5% of payroll tax) and, if applicable, church tax also apply. Employers are liable for correct withholding and remittance.",
    rateInfo: "Einkommensteuertarif des Arbeitnehmers (0%\u201345%); Arbeitgeber haftet",
    filingFrequency: "monatlich (oder quartalsweise / j\xE4hrlich bei geringen Betr\xE4gen)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "\xA7 38 EStG, \xA7 41a EStG (Lohnsteuer-Anmeldung)",
    sourceUrl: ELSTER_URL
  },
  // ── Steuerliche Erfassung / Fragebogen ────────────────────────────────────
  {
    rechtsformSlug: "all",
    taxType: "steuerliche_erfassung",
    labelDe: "Steuerliche Erfassung beim Finanzamt",
    descriptionDe: "Jedes neu gegr\xFCndete Unternehmen muss sich beim zust\xE4ndigen Finanzamt steuerlich erfassen lassen. Dies geschieht durch den 'Fragebogen zur steuerlichen Erfassung', der seit 2021 ausschlie\xDFlich elektronisch \xFCber ELSTER (www.elster.de) eingereicht werden muss (\xA7 138 AO). Der Fragebogen enth\xE4lt Angaben zur Rechtsform, Gesch\xE4ftst\xE4tigkeit, voraussichtlichen Ums\xE4tzen und Gewinnen, USt-Voranmeldungszeitraum, Lohnsteuer und Bankverbindung. Das Finanzamt vergibt daraufhin die Steuernummer. Frist: innerhalb von 4 Wochen nach Aufnahme der gewerblichen/freiberuflichen T\xE4tigkeit.",
    descriptionEn: "Every newly founded company must register for tax purposes with the competent Finanzamt. Since 2021, this is done exclusively electronically via ELSTER using the 'Fragebogen zur steuerlichen Erfassung' (\xA7 138 AO). The questionnaire covers legal form, business activities, expected turnover and profits, VAT filing frequency, payroll tax, and bank details. The Finanzamt then issues the tax number (Steuernummer). Deadline: within 4 weeks of starting commercial or freelance activities.",
    rateInfo: null,
    filingFrequency: "einmalig bei Gr\xFCndung",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "\xA7 138 AO (Abgabenordnung)",
    sourceUrl: ELSTER_URL
  }
];
var BASELINE_DEADLINES = [
  {
    taxType: "umsatzsteuer",
    eventTrigger: "voranmeldung_monatlich",
    labelDe: "Umsatzsteuer-Voranmeldung (monatlich)",
    deadlineDescription: "Unternehmer mit einer Vorjahres-USt-Schuld von \xFCber 7.500 \u20AC m\xFCssen monatlich eine Umsatzsteuer-Voranmeldung \xFCber ELSTER einreichen und die USt entrichten. F\xE4lligkeit: 10. des Folgemonats. Dauerfristverl\xE4ngerung um 1 Monat m\xF6glich (gegen 1/11 der Vorjahressteuer als Sondervorauszahlung, \xA7 47 UStDV).",
    dueDateInfo: "10. des Folgemonats (\xA7 18 Abs. 1 UStG)",
    legalBasis: "\xA7 18 Abs. 1 UStG",
    sourceUrl: ELSTER_URL
  },
  {
    taxType: "umsatzsteuer",
    eventTrigger: "voranmeldung_quartalsweise",
    labelDe: "Umsatzsteuer-Voranmeldung (quartalsweise)",
    deadlineDescription: "Unternehmer mit einer Vorjahres-USt-Schuld zwischen 1.000 \u20AC und 7.500 \u20AC reichen die Voranmeldung quartalsweise ein. F\xE4lligkeitstermine: 10. April, 10. Juli, 10. Oktober, 10. Januar. Dauerfristverl\xE4ngerung m\xF6glich. Neugr\xFCnder (Jahr 1 und 2) sind stets zur monatlichen Voranmeldung verpflichtet.",
    dueDateInfo: "10. April / 10. Juli / 10. Oktober / 10. Januar (\xA7 18 Abs. 2 UStG)",
    legalBasis: "\xA7 18 Abs. 2 UStG",
    sourceUrl: ELSTER_URL
  },
  {
    taxType: "umsatzsteuer",
    eventTrigger: "jahreserklaerung",
    labelDe: "Umsatzsteuer-Jahreserkl\xE4rung",
    deadlineDescription: "Die USt-Jahreserkl\xE4rung ist grunds\xE4tzlich bis zum 31. Juli des Folgejahres einzureichen (\xA7 149 Abs. 2 AO). Mit Steuerberater: Verl\xE4ngerung bis 28./29. Februar des \xFCbern\xE4chsten Jahres m\xF6glich. Kleinunternehmer sind von der Voranmeldungspflicht befreit, m\xFCssen aber ggf. eine Jahreserkl\xE4rung abgeben.",
    dueDateInfo: "31. Juli des Folgejahres (mit Steuerberater: 28./29. Februar des Folgejahres)",
    legalBasis: "\xA7 149 Abs. 2 AO, \xA7 18 Abs. 3 UStG",
    sourceUrl: ELSTER_URL
  },
  {
    taxType: "einkommensteuer",
    eventTrigger: "jahreserklaerung",
    labelDe: "Einkommensteuererkl\xE4rung",
    deadlineDescription: "Selbstst\xE4ndige und Gewerbetreibende m\xFCssen eine j\xE4hrliche Einkommensteuererkl\xE4rung beim Finanzamt einreichen. Grundfrist: 31. Juli des Folgejahres. Mit Steuerberater/Lohnsteuerhilfeverein: 28./29. Februar des \xFCbern\xE4chsten Jahres. Bei versp\xE4teter Abgabe k\xF6nnen Versp\xE4tungszuschl\xE4ge (0,25% der festgesetzten Steuer, mind. 25 \u20AC je angefangenem Monat, max. 25.000 \u20AC) anfallen.",
    dueDateInfo: "31. Juli des Folgejahres (mit Steuerberater: 28./29. Februar)",
    legalBasis: "\xA7 149 Abs. 2 AO, \xA7 152 AO (Versp\xE4tungszuschlag)",
    sourceUrl: BMF_STEUERN_URL
  },
  {
    taxType: "einkommensteuer",
    eventTrigger: "vorauszahlung",
    labelDe: "Einkommensteuer-Vorauszahlung",
    deadlineDescription: "Selbstst\xE4ndige und Gewerbetreibende zahlen quartalsweise Einkommensteuer-Vorauszahlungen, die das Finanzamt auf Basis der Vorjahressteuer oder einer voraussichtlichen Steuerschuld festsetzt. F\xE4lligkeitstermine: 10. M\xE4rz, 10. Juni, 10. September, 10. Dezember. Anpassung der Vorauszahlungen kann beantragt werden.",
    dueDateInfo: "10. M\xE4rz / 10. Juni / 10. September / 10. Dezember (\xA7 37 EStG)",
    legalBasis: "\xA7 37 EStG",
    sourceUrl: BMF_STEUERN_URL
  },
  {
    taxType: "koerperschaftsteuer",
    eventTrigger: "vorauszahlung",
    labelDe: "K\xF6rperschaftsteuer-Vorauszahlung",
    deadlineDescription: "GmbH und UG leisten quartalsweise K\xF6rperschaftsteuer-Vorauszahlungen (15% + SolZ). F\xE4lligkeitstermine identisch mit Einkommensteuer-Vorauszahlungen: 10. M\xE4rz, 10. Juni, 10. September, 10. Dezember. Basis: festgesetzter Vorauszahlungsbetrag, der sich an der Vorjahressteuer orientiert.",
    dueDateInfo: "10. M\xE4rz / 10. Juni / 10. September / 10. Dezember (\xA7 31 KStG i.V.m. \xA7 37 EStG)",
    legalBasis: "\xA7 31 KStG, \xA7 37 EStG",
    sourceUrl: BMF_STEUERN_URL
  },
  {
    taxType: "koerperschaftsteuer",
    eventTrigger: "jahreserklaerung",
    labelDe: "K\xF6rperschaftsteuererkl\xE4rung",
    deadlineDescription: "Kapitalgesellschaften (GmbH, UG) m\xFCssen j\xE4hrlich eine K\xF6rperschaftsteuererkl\xE4rung (KSt 1) sowie eine Gewerbesteuererkl\xE4rung einreichen. Grundfrist: 31. Juli des Folgejahres. Mit Steuerberater: 28./29. Februar des \xFCbern\xE4chsten Jahres.",
    dueDateInfo: "31. Juli des Folgejahres (mit Steuerberater: 28./29. Februar)",
    legalBasis: "\xA7 149 AO, \xA7 31 KStG",
    sourceUrl: BMF_STEUERN_URL
  },
  {
    taxType: "gewerbesteuer",
    eventTrigger: "vorauszahlung",
    labelDe: "Gewerbesteuer-Vorauszahlung",
    deadlineDescription: "Gewerbesteuerpflichtige Unternehmen zahlen quartalsweise Vorauszahlungen. F\xE4lligkeitstermine: 15. Februar, 15. Mai, 15. August, 15. November (\xA7 21 GewStG). Basis: Vorauszahlungsbescheid der Gemeinde. Die Abweichung von den ESt/KSt-Vorauszahlungsterminen ist zu beachten.",
    dueDateInfo: "15. Februar / 15. Mai / 15. August / 15. November (\xA7 21 GewStG)",
    legalBasis: "\xA7 21 GewStG",
    sourceUrl: BUNDESRAT_GEWERBESTEUER_URL
  },
  {
    taxType: "gewerbesteuer",
    eventTrigger: "jahreserklaerung",
    labelDe: "Gewerbesteuererkl\xE4rung",
    deadlineDescription: "Gewerbesteuerpflichtige Unternehmen reichen j\xE4hrlich eine Gewerbesteuererkl\xE4rung beim zust\xE4ndigen Finanzamt ein. Die Gemeinde setzt dann den Gewerbesteuerbescheid fest. Grundfrist: 31. Juli des Folgejahres. Mit Steuerberater: 28./29. Februar des \xFCbern\xE4chsten Jahres.",
    dueDateInfo: "31. Juli des Folgejahres (mit Steuerberater: 28./29. Februar)",
    legalBasis: "\xA7 14a GewStG, \xA7 149 AO",
    sourceUrl: BUNDESRAT_GEWERBESTEUER_URL
  },
  {
    taxType: "lohnsteuer",
    eventTrigger: "anmeldung_monatlich",
    labelDe: "Lohnsteuer-Anmeldung",
    deadlineDescription: "Arbeitgeber reichen monatlich (oder quartalsweise / j\xE4hrlich je nach Lohnsteuersumme) eine Lohnsteuer-Anmeldung \xFCber ELSTER ein und f\xFChren die einbehaltene Lohnsteuer inkl. Solidarit\xE4tszuschlag und Kirchensteuer ab. F\xE4lligkeit: 10. des Folgemonats. Quartalsweise, wenn Lohnsteuer des Vorjahres \u2264 5.000 \u20AC; j\xE4hrlich, wenn \u2264 1.100 \u20AC.",
    dueDateInfo: "10. des Folgemonats (\xA7 41a Abs. 1 EStG)",
    legalBasis: "\xA7 41a Abs. 1 EStG",
    sourceUrl: ELSTER_URL
  },
  {
    taxType: "steuerliche_erfassung",
    eventTrigger: "gruendung",
    labelDe: "Fragebogen zur steuerlichen Erfassung",
    deadlineDescription: "Nach Gr\xFCndung muss der Fragebogen zur steuerlichen Erfassung elektronisch \xFCber ELSTER beim zust\xE4ndigen Finanzamt eingereicht werden. Frist: innerhalb von 4 Wochen nach Aufnahme der T\xE4tigkeit (\xA7 138 AO). Das Finanzamt vergibt die Steuernummer, die auf allen Rechnungen angegeben werden muss. Kapitalgesellschaften ben\xF6tigen f\xFCr die GmbH-Gr\xFCndung zun\xE4chst eine tempor\xE4re Steuernummer vom Finanzamt (vor Eintragung ins Handelsregister).",
    dueDateInfo: "Innerhalb von 4 Wochen nach Aufnahme der T\xE4tigkeit (\xA7 138 Abs. 1 AO)",
    legalBasis: "\xA7 138 AO",
    sourceUrl: ELSTER_URL
  }
];
var OBLIGATION_SOURCE_URLS2 = Object.fromEntries(
  BASELINE_OBLIGATIONS2.map((o) => [
    `${o.rechtsformSlug}|${o.taxType}`,
    `${o.sourceUrl}#tax-obl=${encodeURIComponent(`${o.rechtsformSlug}|${o.taxType}`)}`
  ])
);
var TaxObligationsScraper = class extends BaseScraper {
  constructor() {
    super({
      pipelineName: "scrape-steuern-pflichten",
      pipelineDescription: "Scrapes German tax obligations per Rechtsform from bundesfinanzministerium.de and elster.de (Silo 3: Steuerliche Pflichten f\xFCr Gr\xFCnder)",
      pipelineSchedule: "0 5 * * 1",
      // every Monday at 05:00 UTC
      requestDelayMs: 2e3
    });
  }
  async fetchUrls(_page) {
    return Object.values(OBLIGATION_SOURCE_URLS2);
  }
  parsePage(html, url) {
    const match = url.match(/tax-obl=([^&]+)/);
    const key = match ? decodeURIComponent(match[1]) : null;
    if (!key) return null;
    const [rechtsformSlug, taxType] = key.split("|");
    if (!rechtsformSlug || !taxType) return null;
    const baseline = BASELINE_OBLIGATIONS2.find(
      (o) => o.rechtsformSlug === rechtsformSlug && o.taxType === taxType
    );
    if (!baseline) return null;
    const $ = cheerio5.load(html);
    const liveSection = extractSection3($, [
      "k\xF6rperschaftsteuer",
      "einkommensteuer",
      "gewerbesteuer",
      "umsatzsteuer",
      "lohnsteuer",
      "kleinunternehmer",
      "steuerliche erfassung",
      "fragebogen"
    ]) ?? null;
    const descriptionDe = liveSection && liveSection.length > 120 ? liveSection : baseline.descriptionDe;
    const record = {
      rechtsformSlug,
      taxType,
      labelDe: baseline.labelDe,
      descriptionDe,
      descriptionEn: baseline.descriptionEn,
      rateInfo: baseline.rateInfo,
      filingFrequency: baseline.filingFrequency,
      registrationRequired: baseline.registrationRequired,
      kleinunternehmerRelevant: baseline.kleinunternehmerRelevant,
      legalBasis: baseline.legalBasis,
      sourceUrl: baseline.sourceUrl
    };
    return { ...record, contentHash: makeHash3(record) };
  }
  async diffRecord(record) {
    const existing = await db7.select({
      id: taxObligations.id,
      contentHash: taxObligations.contentHash
    }).from(taxObligations).where(
      and2(
        eq7(taxObligations.rechtsformSlug, record.rechtsformSlug),
        eq7(taxObligations.taxType, record.taxType)
      )
    ).limit(1);
    if (existing.length === 0) return "new";
    if (existing[0].contentHash === record.contentHash) return "unchanged";
    return "updated";
  }
  async writeRecord(record) {
    const now = /* @__PURE__ */ new Date();
    await db7.insert(taxObligations).values({
      rechtsformSlug: record.rechtsformSlug,
      taxType: record.taxType,
      labelDe: record.labelDe,
      descriptionDe: record.descriptionDe,
      descriptionEn: record.descriptionEn,
      rateInfo: record.rateInfo,
      filingFrequency: record.filingFrequency,
      registrationRequired: record.registrationRequired,
      kleinunternehmerRelevant: record.kleinunternehmerRelevant,
      legalBasis: record.legalBasis,
      sourceUrl: record.sourceUrl,
      contentHash: record.contentHash,
      scrapedAt: now
    }).onConflictDoUpdate({
      target: [taxObligations.rechtsformSlug, taxObligations.taxType],
      set: {
        labelDe: record.labelDe,
        descriptionDe: record.descriptionDe,
        descriptionEn: record.descriptionEn,
        rateInfo: record.rateInfo,
        filingFrequency: record.filingFrequency,
        registrationRequired: record.registrationRequired,
        kleinunternehmerRelevant: record.kleinunternehmerRelevant,
        legalBasis: record.legalBasis,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
        updatedAt: now
      }
    });
  }
};
var DEADLINE_SOURCE_URLS = Object.fromEntries(
  BASELINE_DEADLINES.map((d) => [
    `${d.taxType}|${d.eventTrigger}`,
    `${d.sourceUrl}#tax-dl=${encodeURIComponent(`${d.taxType}|${d.eventTrigger}`)}`
  ])
);
var TaxDeadlinesScraper = class extends BaseScraper {
  constructor() {
    super({
      pipelineName: "scrape-steuern-fristen",
      pipelineDescription: "Scrapes German tax filing deadlines from bundesfinanzministerium.de and elster.de (Silo 3: Steuerliche Pflichten f\xFCr Gr\xFCnder)",
      pipelineSchedule: "0 5 * * 1",
      // every Monday at 05:00 UTC
      requestDelayMs: 2e3
    });
  }
  async fetchUrls(_page) {
    return Object.values(DEADLINE_SOURCE_URLS);
  }
  parsePage(html, url) {
    const match = url.match(/tax-dl=([^&]+)/);
    const key = match ? decodeURIComponent(match[1]) : null;
    if (!key) return null;
    const [taxType, eventTrigger] = key.split("|");
    if (!taxType || !eventTrigger) return null;
    const baseline = BASELINE_DEADLINES.find(
      (d) => d.taxType === taxType && d.eventTrigger === eventTrigger
    );
    if (!baseline) return null;
    const $ = cheerio5.load(html);
    const liveSection = extractSection3($, [
      "frist",
      "f\xE4lligkeit",
      "voranmeldung",
      "jahreserkl\xE4rung",
      "vorauszahlung",
      "anmeldung"
    ]) ?? null;
    const deadlineDescription = liveSection && liveSection.length > 80 ? liveSection : baseline.deadlineDescription;
    const record = {
      taxType,
      eventTrigger,
      labelDe: baseline.labelDe,
      deadlineDescription,
      dueDateInfo: baseline.dueDateInfo,
      legalBasis: baseline.legalBasis,
      sourceUrl: baseline.sourceUrl
    };
    return { ...record, contentHash: makeHash3(record) };
  }
  async diffRecord(record) {
    const existing = await db7.select({
      id: taxDeadlines.id,
      contentHash: taxDeadlines.contentHash
    }).from(taxDeadlines).where(
      and2(
        eq7(taxDeadlines.taxType, record.taxType),
        eq7(taxDeadlines.eventTrigger, record.eventTrigger)
      )
    ).limit(1);
    if (existing.length === 0) return "new";
    if (existing[0].contentHash === record.contentHash) return "unchanged";
    return "updated";
  }
  async writeRecord(record) {
    const now = /* @__PURE__ */ new Date();
    await db7.insert(taxDeadlines).values({
      taxType: record.taxType,
      eventTrigger: record.eventTrigger,
      labelDe: record.labelDe,
      deadlineDescription: record.deadlineDescription,
      dueDateInfo: record.dueDateInfo,
      legalBasis: record.legalBasis,
      sourceUrl: record.sourceUrl,
      contentHash: record.contentHash,
      scrapedAt: now
    }).onConflictDoUpdate({
      target: [taxDeadlines.taxType, taxDeadlines.eventTrigger],
      set: {
        labelDe: record.labelDe,
        deadlineDescription: record.deadlineDescription,
        dueDateInfo: record.dueDateInfo,
        legalBasis: record.legalBasis,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
        updatedAt: now
      }
    });
  }
};
async function scrapeSteuern() {
  const pflichtenScraper = new TaxObligationsScraper();
  const pflichtenStats = await pflichtenScraper.run();
  console.log(
    `[scrape-steuern-pflichten] Done \u2014 new: ${pflichtenStats.newCount}, updated: ${pflichtenStats.updatedCount}, unchanged: ${pflichtenStats.unchangedCount}, errors: ${pflichtenStats.errorCount}`
  );
  const fristenScraper = new TaxDeadlinesScraper();
  const fristenStats = await fristenScraper.run();
  console.log(
    `[scrape-steuern-fristen] Done \u2014 new: ${fristenStats.newCount}, updated: ${fristenStats.updatedCount}, unchanged: ${fristenStats.unchangedCount}, errors: ${fristenStats.errorCount}`
  );
}

// src/jobs/scrape-genehmigungen.ts
import * as cheerio6 from "cheerio";
import { createHash as createHash6 } from "crypto";
import { db as db8, permits, berufsgenossenschaften } from "@dataforge/db";
import { eq as eq8 } from "drizzle-orm";
var GEWO_URL = "https://www.gesetze-im-internet.de/gewo/";
var HWO_URL = "https://www.gesetze-im-internet.de/hwo/";
var IHK_ERLAUBNISSE_URL = "https://www.ihk.de/themen/gruendung/erlaubnispflichtige-gewerbe";
var DGUV_BG_URL = "https://www.dguv.de/de/bg/index.jsp";
function makeHash4(data) {
  return createHash6("sha256").update(JSON.stringify(data)).digest("hex");
}
function extractSection4($, headingTexts) {
  const result = [];
  $("h2, h3, h4").each((_, el) => {
    const heading = $(el).text().trim().toLowerCase();
    if (!headingTexts.some((h) => heading.includes(h.toLowerCase()))) return;
    let next = $(el).next();
    while (next.length && !next.is("h2, h3, h4")) {
      const text = next.text().trim();
      if (text) result.push(text);
      next = next.next();
    }
  });
  return result.length > 0 ? result.join("\n\n") : null;
}
var BASELINE_PERMITS = [
  // ── Erlaubnispflichtige Gewerbe (§§ 30–38, 55 GewO) ─────────────────────
  {
    permitKey: "gastst\xE4ttengewerbe",
    permitCategory: "erlaubnispflichtiges_gewerbe",
    tradeCategory: "gastronomie_tourismus",
    permitType: "Gastst\xE4ttenerlaubnis",
    labelDe: "Gastst\xE4ttengewerbe",
    descriptionDe: "Das Betreiben einer Gastst\xE4tte (Schank- und Speisewirtschaft, Beherbergungsbetriebe) erfordert in Bayern, Niedersachsen, Sachsen-Anhalt und Th\xFCringen eine Gastst\xE4ttenerlaubnis nach dem jeweiligen Landesgastst\xE4ttengesetz. In allen anderen Bundesl\xE4ndern ist nach der F\xF6deralismusreform 2006 keine besondere Gastst\xE4ttenerlaubnis mehr erforderlich; stattdessen gelten Anforderungen aus Gewerberecht, Baurecht, Brandschutz, Lebensmittelrecht (LMHV, VO (EG) 852/2004) und Immissionsschutzrecht. Die gewerbliche T\xE4tigkeit muss in allen L\xE4ndern beim zust\xE4ndigen Gewerbeamt angemeldet werden.",
    authorityType: "Ordnungsamt / Gewerbeamt der zust\xE4ndigen Gemeinde",
    authorityLevel: "local",
    requiredDocuments: "Gewerbeanmeldung, polizeiliches F\xFChrungszeugnis, Auszug aus dem Gewerbezentralregister, Nachweis der pers\xF6nlichen Zuverl\xE4ssigkeit, Grundrissplan der Betriebsr\xE4ume, Nachweis der Einhaltung lebensmittelhygienischer Anforderungen (LMHV), ggf. Nachweis der Sachkunde (Alkoholausschank an Minderj\xE4hrige, HACCP-Konzept)",
    costsEur: "100\u2013500 \u20AC (je nach Bundesland und Gemeinde)",
    processingTimeDays: "14\u201360 Tage",
    legalBasis: "GastG Bayern Art. 2, GastG Niedersachsen, GastG Sachsen-Anhalt, GastG Th\xFCringen; \xA7 14 GewO (Gewerbeanmeldung); VO (EG) 852/2004 (Lebensmittelhygiene)",
    sourceUrl: IHK_ERLAUBNISSE_URL
  },
  {
    permitKey: "taxiunternehmen",
    permitCategory: "konzession",
    tradeCategory: "transport_logistik",
    permitType: "Taxikonzession (Genehmigung nach PBefG)",
    labelDe: "Taxiunternehmen / Mietwagen",
    descriptionDe: "Der Betrieb eines Taxiunternehmens oder Mietwagenunternehmens bedarf einer Genehmigung nach dem Personenbef\xF6rderungsgesetz (PBefG). Die Genehmigung wird f\xFCr jedes einzelne Fahrzeug erteilt und ist an die Person des Unternehmers gebunden. Voraussetzungen: Zuverl\xE4ssigkeit, finanzielle Leistungsf\xE4higkeit, fachliche Eignung (Unternehmerpr\xFCfung oder Ausnahmeregelung). Taxi: Betriebspflicht und Bef\xF6rderungspflicht (\xA7 22 PBefG). Mietwagen: R\xFCckkehrpflicht zum Betriebssitz (\xA7 49 Abs. 4 PBefG). F\xFCr Ridesharing-Dienste (\xA7 50 PBefG) und geb\xFCndelte Bedarfsverkehre (\xA7 44 PBefG) gelten seit der PBefG-Novelle 2021 gesonderte Regelungen.",
    authorityType: "Genehmigungsbeh\xF6rde (Landratsamt, kreisfreie Stadt)",
    authorityLevel: "local",
    requiredDocuments: "Gewerbeanmeldung, F\xFChrungszeugnis (Belegart O), Auszug aus dem Gewerbezentralregister, Nachweis der finanziellen Leistungsf\xE4higkeit, Nachweis der fachlichen Eignung (IHK-Fachkundepr\xFCfung), Fahrzeugpapiere (Zulassung, HU, Taxameter-Eichbescheinigung), Nachweis der Kfz-Haftpflichtversicherung",
    costsEur: "200\u2013800 \u20AC pro Fahrzeug",
    processingTimeDays: "30\u201390 Tage",
    legalBasis: "\xA7\xA7 2, 13, 21, 22, 47\u201349 PBefG (Personenbef\xF6rderungsgesetz); BOKraft (Betriebsordnung f\xFCr den Stra\xDFenpersonenverkehr)",
    sourceUrl: IHK_ERLAUBNISSE_URL
  },
  {
    permitKey: "bewachungsgewerbe",
    permitCategory: "erlaubnispflichtiges_gewerbe",
    tradeCategory: "sicherheit",
    permitType: "Bewachungserlaubnis",
    labelDe: "Bewachungsgewerbe",
    descriptionDe: "Das gewerbsm\xE4\xDFige Bewachen fremden Lebens oder fremden Eigentums bedarf einer Erlaubnis nach \xA7 34a GewO. Die Erlaubnis wird f\xFCr den Gewerbetreibenden pers\xF6nlich erteilt. Voraussetzungen: Zuverl\xE4ssigkeit, geordnete Verm\xF6gensverh\xE4ltnisse, Nachweis einer Haftpflichtversicherung, Unterrichtungsnachweis (40 Stunden, IHK) oder Sachkundepr\xFCfung f\xFCr bestimmte T\xE4tigkeitsbereiche (z. B. T\xFCrsteher, Bewachung von Fl\xFCchtlingsunterk\xFCnften, Geld- und Werttransport). Seit der Neuregelung 2019 (Bewachungsgewerbe-Verordnung) gelten versch\xE4rfte Anforderungen. Mitarbeiter m\xFCssen ebenfalls den Unterrichtungsnachweis vorweisen.",
    authorityType: "Industrie- und Handelskammer (IHK) / Gewerbeamt",
    authorityLevel: "local",
    requiredDocuments: "F\xFChrungszeugnis (Belegart O), Auszug aus dem Gewerbezentralregister, Nachweis der Zuverl\xE4ssigkeit, Nachweis geordneter Verm\xF6gensverh\xE4ltnisse (Schufa, kein Insolvenzverfahren), Nachweis der Haftpflichtversicherung (mind. 1 Mio. \u20AC Personensch\xE4den, 750.000 \u20AC Sachsch\xE4den), IHK-Unterrichtungsnachweis (40 h) oder Sachkundepr\xFCfung",
    costsEur: "200\u20131.000 \u20AC",
    processingTimeDays: "30\u201360 Tage",
    legalBasis: "\xA7 34a GewO; Bewachungsgewerbe-Verordnung (BewachV)",
    sourceUrl: IHK_ERLAUBNISSE_URL
  },
  {
    permitKey: "versicherungsvermittler",
    permitCategory: "erlaubnispflichtiges_gewerbe",
    tradeCategory: "finanzdienstleistungen",
    permitType: "Gewerbeerlaubnis Versicherungsvermittlung / -beratung",
    labelDe: "Versicherungsmakler / Versicherungsvertreter / Versicherungsberater",
    descriptionDe: "Die gewerbsm\xE4\xDFige Vermittlung oder Beratung von Versicherungen bedarf einer Erlaubnis nach \xA7 34d GewO. Unterschieden wird zwischen Versicherungsmaklern (\xA7 34d Abs. 1 GewO, treuh\xE4nderischer Wahrer der Kundeninteressen), Versicherungsvertretern (\xA7 34d Abs. 1 GewO, gebunden an Versicherer), und Versicherungsberatern (\xA7 34d Abs. 2 GewO, honorarbasiert). Voraussetzungen: Zuverl\xE4ssigkeit, geordnete Verm\xF6gensverh\xE4ltnisse, Sachkunde (IHK-Sachkundepr\xFCfung), Berufshaftpflichtversicherung (mind. 1.300.380 \u20AC pro Schadenfall). Registrierung im DIHK-Vermittlerregister unter Vermittlerregister.info pflichtweise nach Erlaubniserteilung.",
    authorityType: "Industrie- und Handelskammer (IHK)",
    authorityLevel: "local",
    requiredDocuments: "IHK-Sachkundepr\xFCfungszeugnis (oder Befreiung), F\xFChrungszeugnis (Belegart O), Auszug aus dem Gewerbezentralregister, Schufa-Auskunft, Nachweis der Berufshaftpflichtversicherung, Nachweis geordneter Verm\xF6gensverh\xE4ltnisse",
    costsEur: "200\u2013600 \u20AC",
    processingTimeDays: "30\u201360 Tage",
    legalBasis: "\xA7 34d GewO; VersVermV (Versicherungsvermittlungsverordnung); IDD-Richtlinie (EU) 2016/97",
    sourceUrl: IHK_ERLAUBNISSE_URL
  },
  {
    permitKey: "immobilienmakler",
    permitCategory: "erlaubnispflichtiges_gewerbe",
    tradeCategory: "immobilien",
    permitType: "Maklererlaubnis (\xA7 34c GewO)",
    labelDe: "Immobilienmakler / Darlehensvermittler / Bautr\xE4ger",
    descriptionDe: "Wer gewerbsm\xE4\xDFig Grundst\xFCcke, Wohnr\xE4ume, gewerbliche R\xE4ume oder grundst\xFCcksgleiche Rechte vermittelt (Immobilienmakler) oder als Bautr\xE4ger, Baubetreuer oder Darlehensvermittler t\xE4tig ist, ben\xF6tigt eine Erlaubnis nach \xA7 34c GewO. Voraussetzungen: Zuverl\xE4ssigkeit, geordnete Verm\xF6gensverh\xE4ltnisse. F\xFCr Darlehensvermittler und Wohnimmobilienkreditvermittler (seit 2016) gelten zus\xE4tzlich Sachkundeanforderungen (IHK-Sachkundepr\xFCfung). Pflichtversicherung: F\xFCr Wohnimmobilienkreditvermittler ist eine Berufshaftpflichtversicherung (mind. 460.000 \u20AC / 750.000 \u20AC) vorgeschrieben. Weiterbildungspflicht: 20 Stunden in 3 Jahren (\xA7 34c Abs. 2a GewO seit MaBV-Novelle 2019).",
    authorityType: "Industrie- und Handelskammer (IHK) / Gewerbeamt",
    authorityLevel: "local",
    requiredDocuments: "F\xFChrungszeugnis (Belegart O), Auszug aus dem Gewerbezentralregister, Nachweis geordneter Verm\xF6gensverh\xE4ltnisse (kein Insolvenzverfahren, keine Steuerschulden), Schufa-Auskunft, ggf. IHK-Sachkundenachweis (Wohnimmobilienkreditvermittler), ggf. Nachweis der Berufshaftpflichtversicherung",
    costsEur: "200\u2013600 \u20AC",
    processingTimeDays: "30\u201360 Tage",
    legalBasis: "\xA7 34c GewO; MaBV (Makler- und Bautr\xE4gerverordnung); \xA7 34i GewO (Wohnimmobilienkreditvermittler)",
    sourceUrl: IHK_ERLAUBNISSE_URL
  },
  {
    permitKey: "finanzanlagenvermittler",
    permitCategory: "erlaubnispflichtiges_gewerbe",
    tradeCategory: "finanzdienstleistungen",
    permitType: "Gewerbeerlaubnis Finanzanlagenvermittlung",
    labelDe: "Finanzanlagenvermittler",
    descriptionDe: "Wer gewerbsm\xE4\xDFig den Kauf oder Verkauf von Anteilen an Investmentverm\xF6gen, geschlossenen Fonds, Verm\xF6gensanlagen oder vergleichbaren Produkten vermittelt oder ber\xE4t, ben\xF6tigt eine Erlaubnis nach \xA7 34f GewO. Erlaubnisklassen: \xA7 34f Abs. 1 Satz 1 Nr. 1 (offene Investmentverm\xF6gen), Nr. 2 (geschlossene AIF), Nr. 3 (sonstige Verm\xF6gensanlagen, \xA7 1 Abs. 2 VermAnlG). Voraussetzungen: IHK-Sachkundepr\xFCfung (Finanzanlagenfachmann), Berufshaftpflichtversicherung (mind. 1.276.000 \u20AC / 1.919.000 \u20AC), Zuverl\xE4ssigkeit, geordnete Verm\xF6gensverh\xE4ltnisse. Registrierung im DIHK-Vermittlerregister nach Erlaubniserteilung.",
    authorityType: "Industrie- und Handelskammer (IHK)",
    authorityLevel: "local",
    requiredDocuments: "IHK-Sachkundepr\xFCfung Finanzanlagenfachmann, F\xFChrungszeugnis, Auszug aus dem Gewerbezentralregister, Nachweis geordneter Verm\xF6gensverh\xE4ltnisse, Nachweis der Berufshaftpflichtversicherung",
    costsEur: "200\u2013600 \u20AC",
    processingTimeDays: "30\u201360 Tage",
    legalBasis: "\xA7 34f GewO; FinVermV (Finanzanlagenvermittlungsverordnung)",
    sourceUrl: IHK_ERLAUBNISSE_URL
  },
  {
    permitKey: "reisegewerbe",
    permitCategory: "erlaubnispflichtiges_gewerbe",
    tradeCategory: "handel",
    permitType: "Reisegewerbekarte",
    labelDe: "Reisegewerbe",
    descriptionDe: "Wer au\xDFerhalb einer gewerblichen Niederlassung (ohne festes Ladengesch\xE4ft) oder ohne eine solche Waren oder Leistungen anbietet, ben\xF6tigt eine Reisegewerbekarte (\xA7 55 GewO). Ausnahmen: Handelsvertreter, Hausierer mit Lebensmitteln des t\xE4glichen Bedarfs (unter Voraussetzungen), Personen die nur gelegentlich t\xE4tig sind. Die Karte gilt bundesweit. Besondere Erlaubnisse gelten f\xFCr das Aufstellen von Spielger\xE4ten (\xA7 33c GewO) und das Betreiben von Spielhallen (\xA7 33i GewO).",
    authorityType: "Ordnungsamt / Gewerbeamt der zust\xE4ndigen Gemeinde",
    authorityLevel: "local",
    requiredDocuments: "F\xFChrungszeugnis (Belegart O), Auszug aus dem Gewerbezentralregister, Lichtbild, Nachweis der Zuverl\xE4ssigkeit",
    costsEur: "30\u2013100 \u20AC",
    processingTimeDays: "7\u201321 Tage",
    legalBasis: "\xA7\xA7 55\u201360 GewO",
    sourceUrl: GEWO_URL
  },
  {
    permitKey: "pfandleihgewerbe",
    permitCategory: "erlaubnispflichtiges_gewerbe",
    tradeCategory: "finanzdienstleistungen",
    permitType: "Pfandleiherlaubnis",
    labelDe: "Pfandleihgewerbe",
    descriptionDe: "Das gewerbsm\xE4\xDFige Gew\xE4hren von Darlehen gegen Faustpfand (Pfandleihe) bedarf einer Erlaubnis nach \xA7 34 GewO. Voraussetzungen: Zuverl\xE4ssigkeit, geordnete Verm\xF6gensverh\xE4ltnisse. Die Pfandleiherverordnung (PfandlV) regelt H\xF6chstzinss\xE4tze, Aufbewahrungspflichten und Versteigerungsmodalit\xE4ten. Ein Pfandschein muss ausgeh\xE4ndigt werden. Erl\xF6se aus dem Pfandverkauf \xFCber den Darlehensbetrag stehen dem Verpf\xE4nder zu.",
    authorityType: "Ordnungsamt / Gewerbeamt der zust\xE4ndigen Gemeinde",
    authorityLevel: "local",
    requiredDocuments: "F\xFChrungszeugnis (Belegart O), Auszug aus dem Gewerbezentralregister, Nachweis geordneter Verm\xF6gensverh\xE4ltnisse, Nachweis geeigneter Betriebsr\xE4ume",
    costsEur: "150\u2013500 \u20AC",
    processingTimeDays: "30\u201360 Tage",
    legalBasis: "\xA7 34 GewO; PfandlV (Pfandleiherverordnung)",
    sourceUrl: GEWO_URL
  },
  {
    permitKey: "spielhalle",
    permitCategory: "erlaubnispflichtiges_gewerbe",
    tradeCategory: "unterhaltung",
    permitType: "Spielhallenerlaubnis",
    labelDe: "Spielhalle / Geldspielger\xE4te",
    descriptionDe: "Wer ein Unternehmen betreiben will, das ausschlie\xDFlich oder \xFCberwiegend der gewerbsm\xE4\xDFigen Aufstellung von Spielger\xE4ten mit Gewinnm\xF6glichkeit dient (Spielhalle), bedarf einer Erlaubnis nach \xA7 33i GewO. Das Aufstellen einzelner Geldspielger\xE4te in Gastst\xE4tten oder anderen Betrieben erfordert eine Aufstellgenehmigung nach \xA7 33c GewO. Seit der \xC4nderung des Gl\xFCcksspielstaatsvertrages (Gl\xFCStV 2021) gelten f\xFCr Spielhallen versch\xE4rfte Abstandsregelungen (mind. 500 m zu anderen Spielhallen und zu Schulen), Spielersperren und Sozialkonzept-Pflichten, die durch Landesrecht variieren.",
    authorityType: "Ordnungsamt / Gewerbeamt, ggf. Gl\xFCcksspielaufsichtsbeh\xF6rde",
    authorityLevel: "state",
    requiredDocuments: "F\xFChrungszeugnis (Belegart O), Auszug aus dem Gewerbezentralregister, Grundrissplan, Nachweis der Einhaltung der Abstandsregelungen, Sozialkonzept, Nachweis der Spielger\xE4tegenehmigungen (PTB-Zulassung)",
    costsEur: "500\u20132.000 \u20AC",
    processingTimeDays: "30\u201390 Tage",
    legalBasis: "\xA7 33i GewO (Spielhallen); \xA7 33c GewO (Geldspielger\xE4te); Gl\xFCStV 2021; Landesspielhallengesetze",
    sourceUrl: GEWO_URL
  },
  {
    permitKey: "fahrschule",
    permitCategory: "konzession",
    tradeCategory: "bildung_transport",
    permitType: "Fahrschulerlaubnis",
    labelDe: "Fahrschule",
    descriptionDe: "Wer eine Fahrschule betreibt, bedarf einer Fahrschulerlaubnis nach \xA7 17 Fahrlehrergesetz (FahrlG). Voraussetzungen: Fahrlehrerlaubnis (alle zu erteilenden Klassen), Eignung als Fahrschulinhaber (Unterweisungslehrgang, Ausbildereignungspr\xFCfung), geeignete Unterrichtsr\xE4ume und Lehrfahrzeuge, Haftpflichtversicherung. Die Fahrschule muss bei der zust\xE4ndigen Erlaubnisbeh\xF6rde (i.d.R. Stra\xDFenverkehrsbeh\xF6rde) registriert sein. Pro Fahrlehrer ist eine gesonderte Fahrlehrerlaubnis je Klasse erforderlich (A, B, BE, C, D, FE, DE).",
    authorityType: "Stra\xDFenverkehrsbeh\xF6rde (Landratsamt / kreisfreie Stadt)",
    authorityLevel: "state",
    requiredDocuments: "Fahrlehrerlaubnis (alle relevanten Klassen), Unterweisungslehrgang f\xFCr Fahrschulinhaber, Ausbildereignungsnachweis, F\xFChrungszeugnis, Nachweis geeigneter Unterrichtsr\xE4ume (mind. 20 m\xB2, Ausstattungsanforderungen), Fahrzeugpapiere der Lehrfahrzeuge, Nachweis der Kfz-Haftpflichtversicherung",
    costsEur: "500\u20132.000 \u20AC",
    processingTimeDays: "30\u201390 Tage",
    legalBasis: "\xA7\xA7 17\u201322 FahrlG (Fahrlehrergesetz); DV FahrlG (Durchf\xFChrungsverordnung zum Fahrlehrergesetz)",
    sourceUrl: IHK_ERLAUBNISSE_URL
  },
  // ── Meisterpflicht (Anlage A HwO) ─────────────────────────────────────────
  {
    permitKey: "maurer-betonbauer",
    permitCategory: "meisterpflicht",
    tradeCategory: "handwerk_bau",
    permitType: "Meisterpflicht (Anlage A HwO)",
    labelDe: "Maurer und Betonbauer",
    descriptionDe: "Der Betrieb eines Maurer- und Betonbauerhandwerks in zulassungspflichtigem Handwerk (Anlage A HwO) erfordert die Eintragung in die Handwerksrolle. Voraussetzung ist ein Meisterbrief im Maurer- und Betonbauerhandwerk oder ein gleichwertiger Abschluss. Alternativ: Zulassung mit Ausnahmegenehmigung (\xA7 8 HwO) bei nachgewiesenen besonderen Kenntnissen oder EU-Anerkennungsrichtlinie (EU-Berufsanerkennungsrichtlinie 2005/36/EG f\xFCr Inhaber ausl\xE4ndischer Berufsqualifikationen). Der Betrieb ohne Eintragung ist eine Ordnungswidrigkeit (\xA7 117 HwO). Ausnahmen: Nebenbetriebe gewerblicher Unternehmen (\xA7 3 HwO), Hilfsbetriebe (\xA7 5 HwO).",
    authorityType: "Handwerkskammer (HWK)",
    authorityLevel: "state",
    requiredDocuments: "Meisterbrief (Maurer und Betonbauer) oder gleichwertige Qualifikation, Personalausweis, Gewerbeanmeldung",
    costsEur: "150\u2013400 \u20AC (Eintragungsgeb\xFChr HWK)",
    processingTimeDays: "14\u201330 Tage",
    legalBasis: "Anlage A Nr. 1 HwO; \xA7\xA7 1, 7, 8 HwO (Handwerksordnung)",
    sourceUrl: HWO_URL
  },
  {
    permitKey: "zimmerer",
    permitCategory: "meisterpflicht",
    tradeCategory: "handwerk_bau",
    permitType: "Meisterpflicht (Anlage A HwO)",
    labelDe: "Zimmerer",
    descriptionDe: "Das Zimmererhandwerk (Holzkonstruktionen, Dachstuhlbau, Fertigung von Holzrahmenbauteilen) ist zulassungspflichtiges Handwerk nach Anlage A der Handwerksordnung. Zur selbstst\xE4ndigen Aus\xFCbung ist die Eintragung in die Handwerksrolle mit Meisterbrief (oder gleichwertiger Qualifikation) zwingend erforderlich. EU-Staatsangeh\xF6rige k\xF6nnen eine Anerkennung ausl\xE4ndischer Qualifikationen beantragen.",
    authorityType: "Handwerkskammer (HWK)",
    authorityLevel: "state",
    requiredDocuments: "Meisterbrief (Zimmerer) oder anerkannte gleichwertige Qualifikation, Personalausweis, Gewerbeanmeldung",
    costsEur: "150\u2013400 \u20AC",
    processingTimeDays: "14\u201330 Tage",
    legalBasis: "Anlage A Nr. 2 HwO; \xA7\xA7 1, 7, 8 HwO",
    sourceUrl: HWO_URL
  },
  {
    permitKey: "dachdecker",
    permitCategory: "meisterpflicht",
    tradeCategory: "handwerk_bau",
    permitType: "Meisterpflicht (Anlage A HwO)",
    labelDe: "Dachdecker",
    descriptionDe: "Das Dachdeckerhandwerk (Eindeckung und Abdichtung von D\xE4chern, Au\xDFenwandbekleidungen) ist zulassungspflichtiges Handwerk. Die Eintragung in die Handwerksrolle mit Meisterbrief oder gleichwertiger anerkannter Qualifikation ist Pflicht. Dachdecker m\xFCssen zus\xE4tzlich Unfallverh\xFCtungsvorschriften der BG BAU beachten (DGUV-V 38, PSA gegen Absturz).",
    authorityType: "Handwerkskammer (HWK)",
    authorityLevel: "state",
    requiredDocuments: "Meisterbrief (Dachdecker), Personalausweis, Gewerbeanmeldung",
    costsEur: "150\u2013400 \u20AC",
    processingTimeDays: "14\u201330 Tage",
    legalBasis: "Anlage A Nr. 4 HwO; \xA7\xA7 1, 7, 8 HwO",
    sourceUrl: HWO_URL
  },
  {
    permitKey: "elektrotechniker",
    permitCategory: "meisterpflicht",
    tradeCategory: "handwerk_elektro",
    permitType: "Meisterpflicht (Anlage A HwO)",
    labelDe: "Elektrotechniker",
    descriptionDe: "Das Elektrotechnikerhandwerk ist zulassungspflichtiges Handwerk (Anlage A Nr. 25 HwO). Alle elektrotechnischen Installationsarbeiten in Geb\xE4uden oder Anlagen, die in der VDE 0100 geregelten Spannungsbereichen ausgef\xFChrt werden, d\xFCrfen gewerbsm\xE4\xDFig nur von in die Handwerksrolle eingetragenen Betrieben ausgef\xFChrt werden. Meister- oder Gesellengeselle mit langj\xE4hriger Berufserfahrung und bestandener Unternehmerpr\xFCfung k\xF6nnen Ausnahmegenehmigung nach \xA7 8 HwO beantragen. Zus\xE4tzlich: VDEW/VDE-Konzessionsvertrag mit Netzbetreibern f\xFCr Anschlussarbeiten erforderlich.",
    authorityType: "Handwerkskammer (HWK)",
    authorityLevel: "state",
    requiredDocuments: "Meisterbrief (Elektrotechniker) oder anerkannte Qualifikation, Personalausweis, Gewerbeanmeldung, ggf. Nachweis des Konzessionsvertrags mit dem Netzbetreiber",
    costsEur: "150\u2013400 \u20AC",
    processingTimeDays: "14\u201330 Tage",
    legalBasis: "Anlage A Nr. 25 HwO; \xA7\xA7 1, 7, 8 HwO; VDE 0100",
    sourceUrl: HWO_URL
  },
  {
    permitKey: "installateur-heizungsbauer",
    permitCategory: "meisterpflicht",
    tradeCategory: "handwerk_sanitaer_heizung",
    permitType: "Meisterpflicht (Anlage A HwO)",
    labelDe: "Installateur und Heizungsbauer",
    descriptionDe: "Das Handwerk der Installateure und Heizungsbauer (Gas-, Wasser-, Heizungsinstallation, Klimatechnik) ist zulassungspflichtiges Handwerk (Anlage A Nr. 24 HwO). Arbeiten an Gasanlagen erfordern zus\xE4tzlich die Konzessionierung durch den Gasnetzbetreiber (DVGW-Zertifizierung). Arbeiten an Heizungsanlagen in Geb\xE4uden ab bestimmter Leistungsgrenze unterliegen zudem der EnEV/GEG (Geb\xE4udeenergiegesetz) und m\xFCssen die Energieberatungspflicht beachten.",
    authorityType: "Handwerkskammer (HWK)",
    authorityLevel: "state",
    requiredDocuments: "Meisterbrief (Installateur und Heizungsbauer), Personalausweis, Gewerbeanmeldung, ggf. DVGW-Zertifizierung f\xFCr Gasarbeiten",
    costsEur: "150\u2013400 \u20AC",
    processingTimeDays: "14\u201330 Tage",
    legalBasis: "Anlage A Nr. 24 HwO; \xA7\xA7 1, 7, 8 HwO; DVGW-Regelwerk",
    sourceUrl: HWO_URL
  },
  {
    permitKey: "schornsteinfeger",
    permitCategory: "meisterpflicht",
    tradeCategory: "handwerk_bau",
    permitType: "Meisterpflicht (Anlage A HwO) + Bezirksbevollm\xE4chtigung",
    labelDe: "Schornsteinfeger",
    descriptionDe: "Das Schornsteinfegerhandwerk ist zulassungspflichtiges Handwerk (Anlage A Nr. 12 HwO). Zus\xE4tzlich zur Eintragung in die Handwerksrolle mit Meisterbrief verwaltet das Schornsteinfegerrecht ein duales System: Bevollm\xE4chtigte Bezirksschornsteinfeger werden durch die zust\xE4ndige Beh\xF6rde f\xFCr 7 Jahre f\xFCr einen bestimmten Kehrbezirk bestellt und f\xFChren hoheitliche Aufgaben durch (Feuerst\xE4ttenbeschauen, Feuerst\xE4ttenbescheid, \xDCberpr\xFCfung nach Kehr- und \xDCberpr\xFCfungsordnung). Freie Schornsteinfegerbetriebe k\xF6nnen ohne Bestellung t\xE4tig sein (seit SchfHwG 2013), f\xFChren aber keine hoheitlichen Aufgaben durch.",
    authorityType: "Handwerkskammer (HWK); zust\xE4ndige Beh\xF6rde (Bestellung)",
    authorityLevel: "state",
    requiredDocuments: "Meisterbrief (Schornsteinfeger), Personalausweis, Gewerbeanmeldung, ggf. Bewerbung f\xFCr Bezirksstelle",
    costsEur: "150\u2013400 \u20AC",
    processingTimeDays: "14\u201330 Tage",
    legalBasis: "Anlage A Nr. 12 HwO; \xA7\xA7 1, 7, 8 HwO; SchfHwG (Schornsteinfeger-Handwerksgesetz)",
    sourceUrl: HWO_URL
  },
  {
    permitKey: "friseur",
    permitCategory: "meisterpflicht",
    tradeCategory: "handwerk_koerperpflege",
    permitType: "Meisterpflicht (Anlage A HwO)",
    labelDe: "Friseur",
    descriptionDe: "Das Friseurhandwerk ist seit der Novelle der Handwerksordnung 2004 (Anlage A Nr. 38 HwO) wieder zulassungspflichtiges Handwerk. Vorher war es zulassungsfreies Handwerk (Anlage B1). Die Meisterpflicht gilt f\xFCr den Betriebsinhaber. Friseure m\xFCssen Hygienevorschriften (TRBA 250, Biostoffverordnung) einhalten und Desinfektionsmittel zur Wunddesinfektion bereitstellen. Gesellinnen und Gesellen k\xF6nnen als Besch\xE4ftigte ohne Meisterpflicht t\xE4tig sein.",
    authorityType: "Handwerkskammer (HWK)",
    authorityLevel: "state",
    requiredDocuments: "Meisterbrief (Friseur), Personalausweis, Gewerbeanmeldung",
    costsEur: "150\u2013400 \u20AC",
    processingTimeDays: "14\u201330 Tage",
    legalBasis: "Anlage A Nr. 38 HwO; \xA7\xA7 1, 7, 8 HwO",
    sourceUrl: HWO_URL
  },
  {
    permitKey: "augenoptiker",
    permitCategory: "meisterpflicht",
    tradeCategory: "handwerk_gesundheit",
    permitType: "Meisterpflicht (Anlage A HwO)",
    labelDe: "Augenoptiker",
    descriptionDe: "Das Augenoptikerhandwerk (Anpassen und Verkauf von Sehhilfen, Refraktionsbestimmung) ist zulassungspflichtiges Handwerk (Anlage A Nr. 34 HwO). Die Eintragung in die Handwerksrolle mit Meisterbrief ist f\xFCr den Betriebsinhaber verpflichtend. Augenoptiker d\xFCrfen Brillen anpassen und Sehst\xE4rken bestimmen, jedoch keine ophthalmologischen Diagnosen stellen (Abgrenzung zum Arztberuf). Kontaktlinsenanpassung gilt als Teil des Augenoptikerhandwerks.",
    authorityType: "Handwerkskammer (HWK)",
    authorityLevel: "state",
    requiredDocuments: "Meisterbrief (Augenoptiker), Personalausweis, Gewerbeanmeldung",
    costsEur: "150\u2013400 \u20AC",
    processingTimeDays: "14\u201330 Tage",
    legalBasis: "Anlage A Nr. 34 HwO; \xA7\xA7 1, 7, 8 HwO",
    sourceUrl: HWO_URL
  },
  {
    permitKey: "zahntechniker",
    permitCategory: "meisterpflicht",
    tradeCategory: "handwerk_gesundheit",
    permitType: "Meisterpflicht (Anlage A HwO)",
    labelDe: "Zahntechniker",
    descriptionDe: "Das Zahntechnikerhandwerk (Herstellung von Zahnersatz, Zahnprothesen, kieferorthop\xE4dischen Apparaten) ist zulassungspflichtiges Handwerk (Anlage A Nr. 37 HwO). Zahntechniker arbeiten ausschlie\xDFlich auf Auftrag von Zahn\xE4rzten und haben keinen direkten Patientenkontakt. Die Eintragung in die Handwerksrolle mit Meisterbrief ist f\xFCr den Betriebsinhaber verpflichtend. Medizinprodukte (Zahnersatz) unterliegen der Medizinprodukteverordnung (EU) 2017/745 (MDR) \u2014 eine CE-Zertifizierung als Hersteller ist erforderlich.",
    authorityType: "Handwerkskammer (HWK)",
    authorityLevel: "state",
    requiredDocuments: "Meisterbrief (Zahntechniker), Personalausweis, Gewerbeanmeldung, Registrierung als Medizinproduktehersteller (EUDAMED)",
    costsEur: "150\u2013400 \u20AC",
    processingTimeDays: "14\u201330 Tage",
    legalBasis: "Anlage A Nr. 37 HwO; \xA7\xA7 1, 7, 8 HwO; EU MDR 2017/745 (Medizinprodukteverordnung)",
    sourceUrl: HWO_URL
  },
  {
    permitKey: "kfz-techniker",
    permitCategory: "meisterpflicht",
    tradeCategory: "handwerk_kfz",
    permitType: "Meisterpflicht (Anlage A HwO)",
    labelDe: "Kraftfahrzeugtechniker",
    descriptionDe: "Das Kraftfahrzeugtechnikerhandwerk (Diagnose, Reparatur und Wartung von Kraftfahrzeugen und deren Subsystemen) ist zulassungspflichtiges Handwerk (Anlage A Nr. 13 HwO). Die Eintragung in die Handwerksrolle mit Meisterbrief (Kraftfahrzeugtechniker) ist f\xFCr den Betriebsinhaber verpflichtend. Zus\xE4tzliche Qualifikationen: f\xFCr HU/AU-Berechtigte (\xA7 29 StVZO) ist die Anerkennung als Kraftfahrzeugsachverst\xE4ndigen-Beauftragter durch T\xDCV/DEKRA/GT\xDC etc. notwendig. Betriebe mit Klimaanlagenwartung ben\xF6tigen eine Zertifizierung nach EU 307/2008 (F-Gase-Verordnung).",
    authorityType: "Handwerkskammer (HWK)",
    authorityLevel: "state",
    requiredDocuments: "Meisterbrief (Kraftfahrzeugtechniker), Personalausweis, Gewerbeanmeldung, ggf. HU/AU-Berechtigung, ggf. F-Gase-Zertifizierung",
    costsEur: "150\u2013400 \u20AC",
    processingTimeDays: "14\u201330 Tage",
    legalBasis: "Anlage A Nr. 13 HwO; \xA7\xA7 1, 7, 8 HwO; \xA7 29 StVZO (HU/AU); EU-VO 307/2008 (F-Gase)",
    sourceUrl: HWO_URL
  },
  // ── Überwachungsbedürftige Anlagen (§§ 37–39 GewO, BetrSichV) ─────────────
  {
    permitKey: "druckgeraete-ueberwachung",
    permitCategory: "ueberwachungsbeduerftige_anlage",
    tradeCategory: "industrie_produktion",
    permitType: "Pr\xFCfpflicht \xFCberwachungsbed\xFCrftige Anlage",
    labelDe: "Druckger\xE4te und Druckbeh\xE4lter",
    descriptionDe: "Druckger\xE4te (Dampfkessel, Druckbeh\xE4lter, Rohrleitungen unter Druck) ab bestimmten Druckgrenzen und Volumina sind \xFCberwachungsbed\xFCrftige Anlagen nach \xA7 37 GewO i. V. m. \xA7 2 Nr. 30 ProdSG. Sie unterliegen der Betriebssicherheitsverordnung (BetrSichV). Pflichten: Pr\xFCfung vor Inbetriebnahme durch zugelassene \xDCberwachungsstelle (Z\xDCS, z. B. T\xDCV, DEKRA, GT\xDC) oder bef\xE4higte Person; wiederkehrende Pr\xFCfungen in festgelegten Intervallen (i.d.R. 2\u201310 Jahre je nach Anlage und Druck). Betreiber m\xFCssen eine Gef\xE4hrdungsbeurteilung erstellen und ein Pr\xFCfbuch f\xFChren.",
    authorityType: "Zugelassene \xDCberwachungsstelle (Z\xDCS): T\xDCV, DEKRA, GT\xDC, S\xDCD, Rheinland",
    authorityLevel: "federal",
    requiredDocuments: "CE-Konformit\xE4tserkl\xE4rung des Herstellers, Betriebsanleitung, Pr\xFCfbuch, Gef\xE4hrdungsbeurteilung nach BetrSichV, Betreibernachweis",
    costsEur: "Abh\xE4ngig von Gr\xF6\xDFe und Art der Anlage (500\u201310.000 \u20AC pro Pr\xFCfung)",
    processingTimeDays: "Nach Vereinbarung mit Z\xDCS",
    legalBasis: "\xA7\xA7 37\u201339 GewO; BetrSichV \xA7 14\u201316; ProdSG \xA7 2 Nr. 30; Druckger\xE4teV (14. ProdSV); EU DGRL 2014/68/EU",
    sourceUrl: GEWO_URL
  },
  {
    permitKey: "aufzugsanlagen-ueberwachung",
    permitCategory: "ueberwachungsbeduerftige_anlage",
    tradeCategory: "immobilien",
    permitType: "Pr\xFCfpflicht \xFCberwachungsbed\xFCrftige Anlage",
    labelDe: "Aufzugsanlagen",
    descriptionDe: "Aufzugsanlagen (Personen- und Lastenaufz\xFCge, Fahrtreppen, F\xF6rderanlagen) sind \xFCberwachungsbed\xFCrftige Anlagen nach \xA7 37 GewO i. V. m. BetrSichV Anhang 2 Abschnitt 2. Pflichten des Betreibers: Pr\xFCfung vor erstmaliger Inbetriebnahme und nach wesentlichen \xC4nderungen durch zugelassene \xDCberwachungsstelle (Z\xDCS); wiederkehrende Hauptpr\xFCfung alle 2 Jahre, Zwischenpr\xFCfung alle 2 Jahre (versetzt), durch Z\xDCS oder bef\xE4higte Person. Notrufanlage nach EN 81-28 und Wartungsvertrag mit Aufzugsfirma sind gesetzlich vorgeschrieben. Betreiber haften f\xFCr Unf\xE4lle bei mangelhafter Pr\xFCfung.",
    authorityType: "Zugelassene \xDCberwachungsstelle (Z\xDCS): T\xDCV, DEKRA, GT\xDC; zust\xE4ndige Landesbeh\xF6rde",
    authorityLevel: "state",
    requiredDocuments: "CE-Konformit\xE4tserkl\xE4rung, Betriebsanleitung, Pr\xFCfbuch, Wartungsvertrag, Nachweis der Notrufanlage, Gef\xE4hrdungsbeurteilung",
    costsEur: "500\u20133.000 \u20AC pro Pr\xFCfung",
    processingTimeDays: "Nach Vereinbarung mit Z\xDCS",
    legalBasis: "\xA7\xA7 37\u201339 GewO; BetrSichV Anhang 2 Abschnitt 2; AufzV (12. ProdSV); EU AufzugsRL 2014/33/EU; EN 81-20, EN 81-50",
    sourceUrl: GEWO_URL
  }
];
var BASELINE_BGS = [
  {
    bgKey: "bg-bau",
    name: "Berufsgenossenschaft der Bauwirtschaft",
    shortName: "BG BAU",
    sectorDescription: "Zust\xE4ndige Berufsgenossenschaft f\xFCr alle Unternehmen der Bauwirtschaft, des Geb\xE4udereinigerhandwerks und weiterer bauverwandter Gewerbe. Alle Unternehmer und deren Besch\xE4ftigte im Baugewerbe sind kraft Gesetzes Mitglied der BG BAU (\xA7 2 SGB VII). Freiwillige Versicherung f\xFCr Unternehmer ohne Besch\xE4ftigte m\xF6glich.",
    sectors: "Hochbau, Tiefbau, Ausbaugewerbe, Zimmerer, Dachdecker, Ger\xFCstbau, Estrichleger, Fliesen-/Plattenleger, Maler und Lackierer, Geb\xE4udereinigung, Schornsteinfeger, Stuckateure",
    membershipMandatory: true,
    websiteUrl: "https://www.bgbau.de",
    sourceUrl: DGUV_BG_URL
  },
  {
    bgKey: "bg-rci",
    name: "Berufsgenossenschaft Rohstoffe und chemische Industrie",
    shortName: "BG RCI",
    sectorDescription: "Zust\xE4ndig f\xFCr Unternehmen der Rohstoffgewinnung, der Chemischen Industrie, der Kautschukherstellung und des Mineral\xF6lhandels. Pflichtmitgliedschaft nach \xA7 2 SGB VII f\xFCr alle Arbeitgeber und deren Besch\xE4ftigte in diesen Branchen.",
    sectors: "Chemische Industrie, Kunststoffverarbeitung, Kautschuk, Bergbau, Steinbr\xFCche, Mineral\xF6lverarbeitung, Mineral\xF6lhandel, Papier und Pappe, Kunststoff",
    membershipMandatory: true,
    websiteUrl: "https://www.bgrci.de",
    sourceUrl: DGUV_BG_URL
  },
  {
    bgKey: "bg-holz-metall",
    name: "Berufsgenossenschaft Holz und Metall",
    shortName: "BGHM",
    sectorDescription: "Gr\xF6\xDFte gewerbliche Berufsgenossenschaft Deutschlands. Zust\xE4ndig f\xFCr Betriebe der metallverarbeitenden Industrie und des Metallhandwerks sowie der holzbe- und -verarbeitenden Industrie und des Tischlerhandwerks.",
    sectors: "Metallverarbeitung, Stahlbau, Maschinenbau, Elektroinstallation (Betriebe), Tischler, Schreiner, Holzbe- und -verarbeitung, M\xF6belherstellung, S\xE4gewerke, Glasverarbeitung, Feinmechanik, Uhrmacher",
    membershipMandatory: true,
    websiteUrl: "https://www.bghm.de",
    sourceUrl: DGUV_BG_URL
  },
  {
    bgKey: "bgn",
    name: "Berufsgenossenschaft Nahrungsmittel und Gastgewerbe",
    shortName: "BGN",
    sectorDescription: "Zust\xE4ndig f\xFCr alle Unternehmen der Nahrungsmittelherstellung und -verarbeitung sowie des Gastgewerbes (Gastronomie, Hotellerie). Pflichtmitgliedschaft auch f\xFCr Einzelunternehmer ohne Besch\xE4ftigte in diesen Branchen.",
    sectors: "Gastronomie, Hotellerie, Catering, B\xE4cker, Konditoren, Fleischer, Lebensmittelproduktion, Getr\xE4nkeherstellung, Brauereien, S\xFC\xDFwarenindustrie, Tabak",
    membershipMandatory: true,
    websiteUrl: "https://www.bgn.de",
    sourceUrl: DGUV_BG_URL
  },
  {
    bgKey: "bg-verkehr",
    name: "Berufsgenossenschaft Verkehr",
    shortName: "BG Verkehr",
    sectorDescription: "Zust\xE4ndig f\xFCr Unternehmen des Stra\xDFen-, Schienen- und Luftverkehrs sowie der Binnenschifffahrt, Post, Telekommunikation und Zeitarbeit (teils). Taxiunternehmen und Speditionen sind Pflichtmitglieder.",
    sectors: "Taxiunternehmen, Mietwagenunternehmen, Omnibusunternehmen, Speditionen, Post- und Kurierdienste, Binnenschifffahrt, Luftfahrtunternehmen, Kraftfahrzeughandel, Kraftfahrzeugreparatur (teils), Parkh\xE4user, Fahrradkuriere",
    membershipMandatory: true,
    websiteUrl: "https://www.bg-verkehr.de",
    sourceUrl: DGUV_BG_URL
  },
  {
    bgKey: "vbg",
    name: "Verwaltungs-Berufsgenossenschaft",
    shortName: "VBG",
    sectorDescription: "Zust\xE4ndig f\xFCr Unternehmen aus Verwaltung, Banken, Versicherungen, IT, Medien, freien Berufen und Bildung. H\xE4ufig die zust\xE4ndige BG f\xFCr Startups, Agenturen, IT-Firmen und Finanzdienstleister.",
    sectors: "Banken, Versicherungen, IT-Unternehmen, Unternehmensberatungen, Agenturen (Werbung, PR, Medien), freie Berufe (Steuerberater, Rechtsanw\xE4lte, Architekten), private Schulen, Verlage, Rundfunk, Fitnessstudios, Sicherheitsunternehmen (teils)",
    membershipMandatory: true,
    websiteUrl: "https://www.vbg.de",
    sourceUrl: DGUV_BG_URL
  },
  {
    bgKey: "bgw",
    name: "Berufsgenossenschaft f\xFCr Gesundheitsdienst und Wohlfahrtspflege",
    shortName: "BGW",
    sectorDescription: "Zust\xE4ndig f\xFCr nichtstaatliche Einrichtungen des Gesundheitswesens, der Sozialen Arbeit und der Wohlfahrtspflege. \xC4rzte in Praxen, Physiotherapeuten, Pflegedienste und Krankenh\xE4user in freier Tr\xE4gerschaft sind Pflichtmitglieder.",
    sectors: "Arztpraxen (niedergelassene \xC4rzte), Zahnarztpraxen, Physiotherapiepraxen, Apotheken, ambulante Pflegedienste, Krankenh\xE4user (freie Tr\xE4ger), Alten- und Pflegeheime (freie Tr\xE4ger), Behinderteneinrichtungen, Kinderg\xE4rten (freie Tr\xE4ger), Hebammen",
    membershipMandatory: true,
    websiteUrl: "https://www.bgw-online.de",
    sourceUrl: DGUV_BG_URL
  },
  {
    bgKey: "bghw",
    name: "Berufsgenossenschaft Handel und Warenlogistik",
    shortName: "BGHW",
    sectorDescription: "Zust\xE4ndig f\xFCr Unternehmen des Einzelhandels, Gro\xDFhandels und der Warenlogistik. Auch Online-H\xE4ndler und Versandh\xE4ndler sind Pflichtmitglieder, sofern die Lagerhaltung und Versandabwicklung im eigenen Betrieb erfolgt.",
    sectors: "Einzelhandel, Gro\xDFhandel, Versandhandel (E-Commerce mit Lager), Warenlogistik, Lagerhaltung, Apotheken (teils, sofern keine BGW), Tankstellen, Kioske, Schreibwarenhandel",
    membershipMandatory: true,
    websiteUrl: "https://www.bghw.de",
    sourceUrl: DGUV_BG_URL
  },
  {
    bgKey: "bg-etem",
    name: "Berufsgenossenschaft Energie Textil Elektro Medienerzeugnisse",
    shortName: "BG ETEM",
    sectorDescription: "Zust\xE4ndig f\xFCr Betriebe der Energie- und Wasserwirtschaft, der Elektrotechnik, der Textil- und Bekleidungsbranche sowie der Medienproduktion (Druckerzeugnisse, Verlage \u2014 Produktion). F\xFCr Elektroinstallationsbetriebe zust\xE4ndig, f\xFCr Elektrohandwerksbetriebe teils BGHM.",
    sectors: "Energieversorgungsunternehmen, Elektroanlagenbau, Elektrohandwerk (teils), Textilherstellung, Bekleidungsherstellung, Lederverarbeitung, Schuhe, Druckereien, Verlagswesen (Produktion), Papierverarbeitung",
    membershipMandatory: true,
    websiteUrl: "https://www.bgetem.de",
    sourceUrl: DGUV_BG_URL
  },
  {
    bgKey: "svlfg",
    name: "Sozialversicherung f\xFCr Landwirtschaft, Forsten und Gartenbau",
    shortName: "SVLFG",
    sectorDescription: "Tr\xE4ger der landwirtschaftlichen Unfallversicherung, Krankenversicherung, Pflegeversicherung und Alterssicherung. Zust\xE4ndig f\xFCr alle land- und forstwirtschaftlichen Unternehmen sowie G\xE4rtnereibetriebe. Gartenbaubetriebe (Zierpflanzen, Baumschulen, Obst- und Gem\xFCsebau) sind Pflichtmitglieder der SVLFG, nicht der BGHW.",
    sectors: "Landwirtschaft, Forstwirtschaft, Gartenbau (Zierpflanzen, Obst, Gem\xFCse, Baumschulen), Weinbau, Imkerei, Fischerei (Binnengew\xE4sser), landwirtschaftliche Lohnunternehmen",
    membershipMandatory: true,
    websiteUrl: "https://www.svlfg.de",
    sourceUrl: DGUV_BG_URL
  }
];
var PERMIT_SOURCE_URLS = Object.fromEntries(
  BASELINE_PERMITS.map((p) => [
    p.permitKey,
    `${p.sourceUrl}#permit=${encodeURIComponent(p.permitKey)}`
  ])
);
var PermitsScraper = class extends BaseScraper {
  constructor() {
    super({
      pipelineName: "scrape-genehmigungen-permits",
      pipelineDescription: "Scrapes German permit requirements (GewO, HwO, PBefG) from gesetze-im-internet.de and ihk.de (Silo 5: Genehmigungen & branchenspezifische Auflagen)",
      pipelineSchedule: "0 6 * * 1",
      // every Monday at 06:00 UTC
      requestDelayMs: 2e3
    });
  }
  async fetchUrls(_page) {
    return Object.values(PERMIT_SOURCE_URLS);
  }
  parsePage(html, url) {
    const match = url.match(/permit=([^&]+)/);
    const permitKey = match ? decodeURIComponent(match[1]) : null;
    if (!permitKey) return null;
    const baseline = BASELINE_PERMITS.find((p) => p.permitKey === permitKey);
    if (!baseline) return null;
    const $ = cheerio6.load(html);
    const liveSection = extractSection4($, [
      "erlaubnis",
      "genehmigung",
      "meisterpflicht",
      "handwerksrolle",
      "konzession",
      "bewachung",
      "gastst\xE4tten",
      "taxi"
    ]) ?? null;
    const descriptionDe = liveSection && liveSection.length > 120 ? liveSection : baseline.descriptionDe;
    const record = {
      permitKey: baseline.permitKey,
      permitCategory: baseline.permitCategory,
      tradeCategory: baseline.tradeCategory,
      permitType: baseline.permitType,
      labelDe: baseline.labelDe,
      descriptionDe,
      authorityType: baseline.authorityType,
      authorityLevel: baseline.authorityLevel,
      requiredDocuments: baseline.requiredDocuments,
      costsEur: baseline.costsEur,
      processingTimeDays: baseline.processingTimeDays,
      legalBasis: baseline.legalBasis,
      sourceUrl: baseline.sourceUrl
    };
    return { ...record, contentHash: makeHash4(record) };
  }
  async diffRecord(record) {
    const existing = await db8.select({ id: permits.id, contentHash: permits.contentHash }).from(permits).where(eq8(permits.permitKey, record.permitKey)).limit(1);
    if (existing.length === 0) return "new";
    if (existing[0].contentHash === record.contentHash) return "unchanged";
    return "updated";
  }
  async writeRecord(record) {
    const now = /* @__PURE__ */ new Date();
    await db8.insert(permits).values({
      permitKey: record.permitKey,
      permitCategory: record.permitCategory,
      tradeCategory: record.tradeCategory,
      permitType: record.permitType,
      labelDe: record.labelDe,
      descriptionDe: record.descriptionDe,
      authorityType: record.authorityType,
      authorityLevel: record.authorityLevel,
      requiredDocuments: record.requiredDocuments,
      costsEur: record.costsEur,
      processingTimeDays: record.processingTimeDays,
      legalBasis: record.legalBasis,
      sourceUrl: record.sourceUrl,
      contentHash: record.contentHash,
      scrapedAt: now
    }).onConflictDoUpdate({
      target: [permits.permitKey],
      set: {
        permitCategory: record.permitCategory,
        tradeCategory: record.tradeCategory,
        permitType: record.permitType,
        labelDe: record.labelDe,
        descriptionDe: record.descriptionDe,
        authorityType: record.authorityType,
        authorityLevel: record.authorityLevel,
        requiredDocuments: record.requiredDocuments,
        costsEur: record.costsEur,
        processingTimeDays: record.processingTimeDays,
        legalBasis: record.legalBasis,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
        updatedAt: now
      }
    });
  }
};
var BG_SOURCE_URLS = Object.fromEntries(
  BASELINE_BGS.map((bg) => [
    bg.bgKey,
    `${DGUV_BG_URL}#bg=${encodeURIComponent(bg.bgKey)}`
  ])
);
var BerufsgenossenschaftenScraper = class extends BaseScraper {
  constructor() {
    super({
      pipelineName: "scrape-genehmigungen-bg",
      pipelineDescription: "Scrapes Berufsgenossenschaft sector assignments from dguv.de (Silo 5: Genehmigungen & branchenspezifische Auflagen)",
      pipelineSchedule: "0 6 * * 1",
      // every Monday at 06:00 UTC
      requestDelayMs: 2e3
    });
  }
  async fetchUrls(_page) {
    return Object.values(BG_SOURCE_URLS);
  }
  parsePage(html, url) {
    const match = url.match(/bg=([^&]+)/);
    const bgKey = match ? decodeURIComponent(match[1]) : null;
    if (!bgKey) return null;
    const baseline = BASELINE_BGS.find((bg) => bg.bgKey === bgKey);
    if (!baseline) return null;
    const $ = cheerio6.load(html);
    const liveSection = extractSection4($, [
      "zust\xE4ndigkeit",
      "zustaendigkeit",
      "branche",
      "berufsgenossenschaft",
      "mitgliedschaft",
      "beitragsberechnung"
    ]) ?? null;
    const sectorDescription = liveSection && liveSection.length > 80 ? liveSection : baseline.sectorDescription;
    const record = {
      bgKey: baseline.bgKey,
      name: baseline.name,
      shortName: baseline.shortName,
      sectorDescription,
      sectors: baseline.sectors,
      membershipMandatory: baseline.membershipMandatory,
      websiteUrl: baseline.websiteUrl,
      sourceUrl: baseline.sourceUrl
    };
    return { ...record, contentHash: makeHash4(record) };
  }
  async diffRecord(record) {
    const existing = await db8.select({
      id: berufsgenossenschaften.id,
      contentHash: berufsgenossenschaften.contentHash
    }).from(berufsgenossenschaften).where(eq8(berufsgenossenschaften.bgKey, record.bgKey)).limit(1);
    if (existing.length === 0) return "new";
    if (existing[0].contentHash === record.contentHash) return "unchanged";
    return "updated";
  }
  async writeRecord(record) {
    const now = /* @__PURE__ */ new Date();
    await db8.insert(berufsgenossenschaften).values({
      bgKey: record.bgKey,
      name: record.name,
      shortName: record.shortName,
      sectorDescription: record.sectorDescription,
      sectors: record.sectors,
      membershipMandatory: record.membershipMandatory,
      websiteUrl: record.websiteUrl,
      sourceUrl: record.sourceUrl,
      contentHash: record.contentHash,
      scrapedAt: now
    }).onConflictDoUpdate({
      target: [berufsgenossenschaften.bgKey],
      set: {
        name: record.name,
        shortName: record.shortName,
        sectorDescription: record.sectorDescription,
        sectors: record.sectors,
        membershipMandatory: record.membershipMandatory,
        websiteUrl: record.websiteUrl,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
        updatedAt: now
      }
    });
  }
};
async function scrapeGenehmigungen() {
  const permitsScraper = new PermitsScraper();
  const bgScraper = new BerufsgenossenschaftenScraper();
  const permitsStats = await permitsScraper.run();
  const bgStats = await bgScraper.run();
  console.log(
    `[scrape-genehmigungen] Permits \u2014 new: ${permitsStats.newCount}, updated: ${permitsStats.updatedCount}, unchanged: ${permitsStats.unchangedCount}`
  );
  console.log(
    `[scrape-genehmigungen] BGs \u2014 new: ${bgStats.newCount}, updated: ${bgStats.updatedCount}, unchanged: ${bgStats.unchangedCount}`
  );
}

// src/worker.ts
var connectionString = process.env["DATABASE_URL"] ?? "postgres://dataforge:dataforge@localhost:5432/dataforge";
var SCHEDULE_SCRAPE_FUNDING = "0 2 * * 0";
var SCHEDULE_SCRAPE_RECHTSFORMEN = "0 3 * * 1";
var SCHEDULE_SCRAPE_SOZIALVERSICHERUNG = "0 4 * * 1";
var SCHEDULE_SCRAPE_STEUERN = "0 5 * * 1";
var SCHEDULE_SCRAPE_GENEHMIGUNGEN = "0 6 * * 1";
var SCHEDULE_QUOTA_WARNINGS = "0 10 * * *";
var boss = new PgBoss(connectionString);
boss.on("error", (err) => console.error("PgBoss error:", err));
async function start() {
  await boss.start();
  console.log("DataForge worker started");
  await boss.work("scrape-funding-bund", { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    console.log(`[worker] scrape-funding-bund job started (id=${job.id})`);
    await scrapeFundingBund();
  });
  await boss.schedule("scrape-funding-bund", SCHEDULE_SCRAPE_FUNDING, {}, { singletonKey: "weekly" });
  console.log(`[worker] scrape-funding-bund scheduled: ${SCHEDULE_SCRAPE_FUNDING}`);
  await boss.work("scrape-rechtsformen", { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    console.log(`[worker] scrape-rechtsformen job started (id=${job.id})`);
    await scrapeRechtsformen();
  });
  await boss.schedule("scrape-rechtsformen", SCHEDULE_SCRAPE_RECHTSFORMEN, {}, { singletonKey: "weekly" });
  console.log(`[worker] scrape-rechtsformen scheduled: ${SCHEDULE_SCRAPE_RECHTSFORMEN}`);
  await boss.work("scrape-sv", { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    console.log(`[worker] scrape-sv job started (id=${job.id})`);
    await scrapeSozialversicherung();
  });
  await boss.schedule("scrape-sv", SCHEDULE_SCRAPE_SOZIALVERSICHERUNG, {}, { singletonKey: "weekly" });
  console.log(`[worker] scrape-sv scheduled: ${SCHEDULE_SCRAPE_SOZIALVERSICHERUNG}`);
  await boss.work("scrape-steuern", { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    console.log(`[worker] scrape-steuern job started (id=${job.id})`);
    await scrapeSteuern();
  });
  await boss.schedule("scrape-steuern", SCHEDULE_SCRAPE_STEUERN, {}, { singletonKey: "weekly" });
  console.log(`[worker] scrape-steuern scheduled: ${SCHEDULE_SCRAPE_STEUERN}`);
  await boss.work("scrape-genehmigungen", { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    console.log(`[worker] scrape-genehmigungen job started (id=${job.id})`);
    await scrapeGenehmigungen();
  });
  await boss.schedule("scrape-genehmigungen", SCHEDULE_SCRAPE_GENEHMIGUNGEN, {}, { singletonKey: "weekly" });
  console.log(`[worker] scrape-genehmigungen scheduled: ${SCHEDULE_SCRAPE_GENEHMIGUNGEN}`);
  await boss.work("quota-warnings", { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    console.log(`[worker] quota-warnings job started (id=${job.id})`);
    await runQuotaWarnings();
  });
  await boss.schedule("quota-warnings", SCHEDULE_QUOTA_WARNINGS, {}, { singletonKey: "daily" });
  console.log(`[worker] quota-warnings scheduled: ${SCHEDULE_QUOTA_WARNINGS}`);
}
start().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
