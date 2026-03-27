export interface FieldSchema {
    /** Human-readable description sent to the LLM (include language hints for German pages). */
    description: string;
    /** Optional short hint about where to look (e.g. "look for 'Kurztext' headings"). */
    hint?: string;
}
export interface LlmExtractionInput {
    /** Raw HTML of the page. Will be noise-stripped before sending to the LLM. */
    html: string;
    /** Fields to extract, keyed by field name. */
    fields: Record<string, FieldSchema>;
}
export interface LlmExtractionResult {
    /** Extracted field values — null for fields the LLM could not find. */
    fields: Record<string, string | null>;
    tokensInput: number;
    tokensOutput: number;
    durationMs: number;
}
/** Tracks per-field extraction source for hybrid pipeline logging. */
export type FieldSource = "css" | "llm" | "none";
export interface HybridExtractionLog {
    /** Which source provided each field value. */
    fieldSources: Record<string, FieldSource>;
    /** Total LLM tokens consumed (0 if LLM was not called). */
    llmTokensUsed: number;
    /** Number of LLM API calls made. */
    llmCalls: number;
    /** Wall-clock time for LLM calls in ms. */
    llmDurationMs: number;
}
/**
 * Remove nav, footer, header, scripts, and other non-content elements.
 * Returns plain text, truncated to MAX_CONTENT_CHARS.
 */
export declare function stripHtmlNoise(html: string): string;
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
export declare function extractFieldsWithLLM(input: LlmExtractionInput): Promise<LlmExtractionResult>;
/**
 * Merge CSS-extracted fields with LLM fallback for nulls.
 *
 * @param cssFields   Output of CSS parsing (null = not found by CSS)
 * @param html        Raw HTML — will be sent to LLM only if there are missing fields
 * @param fieldSchemas Schemas for each field (used to build the LLM prompt)
 * @param enableLlm   Feature flag — set to false to skip LLM (useful for cost testing)
 * @returns Merged fields + extraction log
 */
export declare function mergeWithLlmFallback<T extends Record<string, string | null>>(cssFields: T, html: string, fieldSchemas: Record<keyof T & string, FieldSchema>, enableLlm?: boolean): Promise<{
    merged: T;
    log: HybridExtractionLog;
}>;
//# sourceMappingURL=llm-extractor.d.ts.map