/**
 * LLM-based data extraction utility using Claude Haiku via raw HTTP.
 *
 * Provides a fallback extraction layer for fields that CSS selectors fail to capture.
 * Designed to slot into the hybrid pipeline: CSS runs first, then LLM fills the gaps.
 *
 * No external SDK required — uses Node.js 18+ native fetch.
 */
import * as cheerio from "cheerio";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
// Use Haiku for cost-efficiency: fast, cheap, sufficient for structured extraction.
// At $1/1M input + $5/1M output, a typical 3K-token extraction costs ~$0.003.
const MODEL = "claude-haiku-4-5";
// Trim page text to limit token usage per call.
// 12 000 chars ≈ 3 000 tokens — enough to capture all major content sections.
const MAX_CONTENT_CHARS = 12_000;
// ─── HTML noise stripping ─────────────────────────────────────────────────────
/**
 * Remove nav, footer, header, scripts, and other non-content elements.
 * Returns plain text, truncated to MAX_CONTENT_CHARS.
 */
export function stripHtmlNoise(html) {
    const $ = cheerio.load(html);
    $("nav, footer, header, script, style, noscript, " +
        ".navigation, .nav, .breadcrumb, .sidebar, .menu, " +
        ".cookie-banner, .cookie-notice, .search-form, " +
        "[role='navigation'], [role='banner'], [role='contentinfo']").remove();
    const text = $("body").text().replace(/\s+/g, " ").trim();
    return text.substring(0, MAX_CONTENT_CHARS);
}
async function callAnthropicAPI(messages, maxTokens = 1024) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error("[llm-extractor] ANTHROPIC_API_KEY environment variable is not set");
    }
    const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
            "content-type": "application/json",
        },
        body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages }),
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`[llm-extractor] Anthropic API error ${response.status}: ${body}`);
    }
    return (await response.json());
}
// ─── Core extraction function ─────────────────────────────────────────────────
/**
 * Extract structured fields from HTML using Claude Haiku.
 *
 * Only pass fields that CSS failed to populate — this keeps prompts short
 * and costs predictable.
 *
 * @example
 * const result = await extractFieldsWithLLM({
 *   html: pageHtml,
 *   fields: {
 *     summaryDe: { description: "Short summary of the funding program (Kurztext)" },
 *     deadlineInfo: { description: "Application deadline or cut-off dates (Frist/Termin)" },
 *   },
 * });
 * // result.fields.summaryDe => "Das Programm fördert..."
 * // result.tokensInput => 2847
 */
export async function extractFieldsWithLLM(input) {
    const fieldNames = Object.keys(input.fields);
    if (fieldNames.length === 0) {
        return { fields: {}, tokensInput: 0, tokensOutput: 0, durationMs: 0 };
    }
    const content = stripHtmlNoise(input.html);
    const fieldDescriptions = fieldNames
        .map((name) => {
        const schema = input.fields[name];
        const hint = schema.hint ? ` (${schema.hint})` : "";
        return `  "${name}": ${schema.description}${hint}`;
    })
        .join("\n");
    const prompt = `Extract the following fields from this German government page. ` +
        `Return a JSON object with exactly these keys. Use null for fields that cannot be found.\n\n` +
        `Fields to extract:\n{\n${fieldDescriptions}\n}\n\n` +
        `Page content:\n${content}\n\n` +
        `Return only valid JSON, no explanation.`;
    const t0 = Date.now();
    const response = await callAnthropicAPI([{ role: "user", content: prompt }]);
    const durationMs = Date.now() - t0;
    // Initialize all fields to null — LLM may not find everything
    const fields = Object.fromEntries(fieldNames.map((f) => [f, null]));
    const textBlock = response.content.find((b) => b.type === "text");
    if (textBlock?.type === "text" && textBlock.text) {
        try {
            // Extract JSON even if the model adds surrounding commentary
            const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                for (const name of fieldNames) {
                    const val = parsed[name];
                    // Only accept non-empty strings
                    if (typeof val === "string" && val.trim().length > 0) {
                        fields[name] = val.trim();
                    }
                }
            }
        }
        catch {
            console.warn("[llm-extractor] Failed to parse JSON response from LLM:", textBlock.text.substring(0, 200));
        }
    }
    return {
        fields,
        tokensInput: response.usage.input_tokens,
        tokensOutput: response.usage.output_tokens,
        durationMs,
    };
}
// ─── Hybrid merge helper ──────────────────────────────────────────────────────
/**
 * Merge CSS-extracted fields with LLM fallback for nulls.
 *
 * @param cssFields   Output of CSS parsing (null = not found by CSS)
 * @param html        Raw HTML — will be sent to LLM only if there are missing fields
 * @param fieldSchemas Schemas for each field (used to build the LLM prompt)
 * @param enableLlm   Feature flag — set to false to skip LLM (useful for cost testing)
 * @returns Merged fields + extraction log
 */
export async function mergeWithLlmFallback(cssFields, html, fieldSchemas, enableLlm = true) {
    const log = {
        fieldSources: {},
        llmTokensUsed: 0,
        llmCalls: 0,
        llmDurationMs: 0,
    };
    // Track which fields CSS populated
    const missingFields = [];
    for (const field of Object.keys(cssFields)) {
        if (cssFields[field] !== null) {
            log.fieldSources[field] = "css";
        }
        else {
            missingFields.push(field);
            log.fieldSources[field] = "none"; // will update after LLM call
        }
    }
    if (!enableLlm || missingFields.length === 0) {
        return { merged: cssFields, log };
    }
    // Only request schemas for missing fields
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
    // Merge LLM results back into CSS output
    const merged = { ...cssFields };
    for (const field of missingFields) {
        const llmVal = llmResult.fields[field];
        if (llmVal) {
            merged[field] = llmVal;
            log.fieldSources[field] = "llm";
        }
        // else remains "none"
    }
    return { merged, log };
}
//# sourceMappingURL=llm-extractor.js.map