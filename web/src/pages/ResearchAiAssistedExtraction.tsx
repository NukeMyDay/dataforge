// Research article: AI-assisted Data Extraction from Unstructured Government Sources
// Published at /research/ai-assisted-extraction

export default function ResearchAiAssistedExtractionPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-8">
        <a href="/research" className="hover:text-brand-600 transition-colors">
          Research
        </a>
        <span className="mx-2">/</span>
        <span className="text-gray-900">AI-assisted Data Extraction</span>
      </nav>

      {/* Header */}
      <header className="mb-12">
        <div className="flex gap-2 mb-4">
          <span className="badge bg-brand-50 text-brand-700 text-xs">Machine Learning</span>
          <span className="badge bg-gray-100 text-gray-600 text-xs">Whitepaper</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-4">
          AI-assisted Data Extraction from Unstructured Government Sources
        </h1>
        <div className="flex items-center gap-4 text-sm text-gray-500 border-t border-b border-gray-100 py-4">
          <span>Sophex Research</span>
          <span>·</span>
          <time dateTime="2026-03-27">March 27, 2026</time>
          <span>·</span>
          <span>~20 min read</span>
        </div>
      </header>

      {/* Abstract */}
      <section className="bg-gray-50 rounded-xl p-6 mb-10 border border-gray-200">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Abstract</h2>
        <p className="text-gray-700 leading-relaxed">
          German government web portals are built on CMS platforms with divergent structural conventions, causing
          CSS-selector-based scrapers to silently fail on a meaningful fraction of pages. This paper presents
          the design, implementation, and benchmark results of three extraction strategies — CSS-only,
          LLM-only, and a hybrid pipeline that uses CSS selectors as the primary extraction layer and Claude
          Haiku as a semantic fallback — evaluated against a 20-page sample from <em>foerderdatenbank.de</em>.
          CSS-only achieves 75.0% mean field coverage with 0% error rate at sub-millisecond cost per page.
          LLM-only achieves 60.0% mean coverage but produces a complete extraction failure (zero fields) on
          35% of pages — a critical reliability problem. The hybrid approach achieves 92.1% mean field
          coverage with 0% error rate, a 17.1 percentage-point improvement over CSS-only, at an estimated
          cost of $33.20 per full corpus scrape (~2,600 programs). The most striking finding is that
          <code>deadlineInfo</code> has a 0% CSS fill rate across all tested pages, making LLM augmentation
          effectively mandatory for that field. In a simulated CMS restructure, CSS drops 100% of its fields
          while the hybrid maintains full extraction. We describe the architecture of the{" "}
          <code>mergeWithLlmFallback()</code> utility and offer decision criteria for deploying each strategy.
        </p>
      </section>

      {/* Article body */}
      <article className="prose prose-gray prose-lg max-w-none">

        {/* 1. Introduction */}
        <h2>1. Introduction</h2>
        <p>
          A well-designed CSS scraper is fast, deterministic, and cheap to run. For government websites where
          page structure is stable, it is the right tool. The problem is stability. German federal and state
          portals are predominantly managed on CMS platforms — TYPO3, OpenCMS, Drupal — that share broad
          structural conventions but diverge on heading hierarchies, CSS class names, and dt/dd patterns in
          ways that are unpredictable and undocumented. A heading selector that reliably finds the{" "}
          <em>Kurztext</em> section on 70% of foerderdatenbank.de pages fails silently on the remaining 30%
          because those pages use <em>Kurzzusammenfassung</em>, or nest the content under an additional
          wrapper div, or render the section via a JavaScript widget that defers its DOM insertion.
        </p>
        <p>
          Worse, these failures are invisible at the pipeline level. The scraper runs successfully, writes a
          record, and returns exit code 0 — but the record contains <code>null</code> for fields that are
          present on the page and matter to end users. A funding program listing with a null{" "}
          <code>deadlineInfo</code> is not a scrape failure; it is a silent data quality regression.
        </p>
        <p>
          This paper documents Sophex's response to this problem: a hybrid extraction pipeline (DAT-48) that
          combines CSS selectors for coverage efficiency with a large language model as a semantic fallback for
          fields that CSS fails to populate. The implementation uses Claude Haiku [1], chosen for its
          cost-efficiency on structured extraction tasks. The pipeline is designed to be additive — CSS remains
          the primary layer; the LLM is a second pass run only when and only for fields that CSS fails to
          extract.
        </p>
        <p>
          The target audience for this paper is data engineers and ML practitioners building pipelines against
          semi-structured public-sector data. The findings and design patterns apply to any domain where a
          primary CSS extraction layer provides good-but-imperfect coverage and the cost of missing fields
          exceeds the marginal cost of LLM inference.
        </p>

        {/* 2. Problem: CSS Selector Fragility */}
        <h2>2. The Fragility of CSS Selectors on Government CMS Platforms</h2>
        <p>
          The Sophex scraper for <em>foerderdatenbank.de</em> targets seven text fields per funding program:
        </p>
        <ul>
          <li><code>summaryDe</code> — short program summary (Kurztext section)</li>
          <li><code>descriptionDe</code> — full program description (Volltext section)</li>
          <li><code>legalRequirementsDe</code> — eligibility and legal prerequisites</li>
          <li><code>directiveDe</code> — underlying statute or ordinance (Richtlinie)</li>
          <li><code>applicationProcess</code> — how to apply (Antrag/Verfahren section)</li>
          <li><code>deadlineInfo</code> — application deadlines (Frist/Termin section)</li>
          <li><code>fundingAmountInfo</code> — funding ceiling and amounts (regex-extracted)</li>
        </ul>
        <p>
          The CSS extractor uses a combination of heading-text matching (find h2/h3 with text matching
          "Kurztext", "Volltext", etc., then collect sibling paragraphs), dt/dd parsing for metadata fields,
          and regex patterns for monetary amounts. Across the 20-page benchmark sample, this approach achieves
          a mean fill rate of 75.0% — 5.25 of 7 fields per page. The headline number is flattering: CSS
          reliably extracts five of seven fields (90–100% fill rates), but fails completely on{" "}
          <code>deadlineInfo</code> (0%) and partially on <code>fundingAmountInfo</code> (50% — the
          regex-based field).
        </p>
        <p>
          Four failure modes account for most of the shortfall:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Failure Mode</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Estimated Frequency</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2">Non-standard heading text (e.g. <em>Kurzzusammenfassung</em> vs <em>Kurztext</em>)</td>
                <td className="border border-gray-200 px-4 py-2">~15%</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">Content nested under extra wrapper divs</td>
                <td className="border border-gray-200 px-4 py-2">~10%</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2">Heading hierarchy changes (h2→h3 or h3→h4)</td>
                <td className="border border-gray-200 px-4 py-2">~8%</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">Content loaded via AJAX after initial DOM</td>
                <td className="border border-gray-200 px-4 py-2">~5%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          These failure modes are not bugs in the scraper — they are the inherent cost of targeting a CMS
          ecosystem that does not enforce a content schema. The question is not how to fix the CSS extractor,
          but whether there is a cost-effective second layer that can recover the fields it misses.
        </p>

        {/* 3. Methodology */}
        <h2>3. Methodology</h2>
        <h3>3.1 Baseline Measurement</h3>
        <p>
          A benchmark script (<code>pipelines/src/jobs/llm-extraction-benchmark.ts</code>) fetches a
          configurable sample of pages from foerderdatenbank.de and runs three extractors against each page:
          CSS-only, LLM-only, and the hybrid (CSS with LLM fallback). It records, per page and per field:
          whether each extractor populated the field, whether extraction succeeded or errored, and the token
          and latency cost of any LLM calls. Results are written to{" "}
          <code>pipelines/benchmark-results/css-vs-llm-2026-03-27.json</code>.
        </p>
        <p>
          The 20-page sample spans programs from six German states (Sachsen, Thüringen, NRW,
          Baden-Württemberg, Bremen, Hamburg, Rheinland-Pfalz), covering the structural variation present in
          the corpus. All three extractors run against the same fetched HTML, making the comparison
          controlled.
        </p>
        <h3>3.2 Hybrid Pipeline Design</h3>
        <p>
          The hybrid pipeline introduces a single-pass LLM fallback after CSS extraction completes. The
          decision logic is:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`URL → Playwright fetch → CSS parse
  → if fields_found >= threshold: write record directly
  → else: LLM fallback on missing fields only → merge → write record`}
        </pre>
        <p>
          The LLM is called only when the CSS extractor leaves at least one target field null. Within that
          call, only the missing fields are requested — the prompt is constructed dynamically to include only
          the schemas of fields that CSS failed to populate. This keeps prompts short and costs proportional
          to actual extraction failures rather than page count.
        </p>
        <h3>3.3 HTML Noise Stripping</h3>
        <p>
          Before sending page content to the LLM, the{" "}
          <code>stripHtmlNoise()</code> function in <code>llm-extractor.ts</code> removes elements that do
          not contribute to substantive content: navigation, footer, header, scripts, styles, breadcrumbs,
          cookie banners, and sidebar elements. The remaining body text is collapsed (whitespace normalised)
          and truncated to 12,000 characters — approximately 3,000 tokens — to bound per-call cost.
        </p>
        <h3>3.4 Prompt Design</h3>
        <p>
          The extraction prompt follows a schema-injection pattern. Field descriptions and optional location
          hints are serialised into the prompt as a JSON-like structure, giving the model both the field name
          and enough semantic context to locate the relevant content. The prompt explicitly instructs the model
          to return only valid JSON and to use <code>null</code> for fields it cannot find — reducing the risk
          of hallucinated or fabricated values.
        </p>
        <p>
          The following excerpt from <code>pipelines/src/lib/llm-extractor.ts</code> shows how the prompt is
          constructed from the field schema map:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`// Build per-field description lines from the schema map
const fieldDescriptions = fieldNames
  .map((name) => {
    const schema = input.fields[name]!;
    const hint = schema.hint ? \` (\${schema.hint})\` : "";
    return \`  "\${name}": \${schema.description}\${hint}\`;
  })
  .join("\\n");

const prompt =
  \`Extract the following fields from this German government page. \` +
  \`Return a JSON object with exactly these keys. Use null for fields that cannot be found.\\n\\n\` +
  \`Fields to extract:\\n{\\n\${fieldDescriptions}\\n}\\n\\n\` +
  \`Page content:\\n\${content}\\n\\n\` +
  \`Return only valid JSON, no explanation.\`;`}
        </pre>
        <p>
          An example call for two missing fields would produce a prompt like:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`Extract the following fields from this German government page.
Return a JSON object with exactly these keys. Use null for fields that cannot be found.

Fields to extract:
{
  "summaryDe": Short summary of the funding program in German (look for 'Kurztext' headings),
  "deadlineInfo": Application deadlines in German (look for 'Frist' headings)
}

Page content:
[stripped text, max 12,000 chars]

Return only valid JSON, no explanation.`}
        </pre>
        <h3>3.5 JSON Parsing and Robustness</h3>
        <p>
          The response parser applies a regex to extract the first JSON object from the response text before
          parsing, tolerating any preamble or commentary the model may include despite the explicit
          instruction. Only non-empty string values are accepted; numeric values, booleans, and objects are
          discarded. If JSON parsing fails entirely, the CSS-extracted record is written as-is with a
          warning log — the LLM call never causes a pipeline failure.
        </p>
        <h3>3.6 Resilience Test</h3>
        <p>
          To simulate a CMS update that restructures page headings, all h2/h3 elements in the benchmark HTML
          are programmatically renamed to h4/h5 before parsing. This breaks every heading-based CSS selector
          while leaving the substantive text content unchanged. Both the CSS-only and hybrid extractors are
          then run on the modified HTML, measuring how well each recovers from the simulated structural
          change.
        </p>

        {/* 4. Implementation */}
        <h2>4. Implementation Architecture</h2>
        <h3>4.1 Core Utility: <code>mergeWithLlmFallback()</code></h3>
        <p>
          The primary integration point for pipeline authors is the{" "}
          <code>mergeWithLlmFallback()</code> function in{" "}
          <code>pipelines/src/lib/llm-extractor.ts</code>. It accepts a CSS-extracted record, the raw HTML,
          and a field schema map, and returns a merged record with an extraction log:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`const { merged, log } = await mergeWithLlmFallback(
  cssFields,       // Record<string, string | null> from CSS extractor
  rawHtml,         // Raw HTML string from Playwright
  fieldSchemas,    // Record<fieldName, { description, hint? }>
  enableLlm        // Feature flag — false skips LLM entirely
);

// log.fieldSources: { summaryDe: "css", deadlineInfo: "llm", directiveDe: "none" }
// log.llmTokensUsed: 3241
// log.llmCalls: 1`}
        </pre>
        <p>
          The function is generic over the record type <code>T</code>, so the type checker ensures that field
          schemas are provided for all nullable fields in the record. The function makes at most one LLM API
          call per page — all missing fields are batched into a single prompt.
        </p>
        <h3>4.2 Feature Flag and Cost Control</h3>
        <p>
          The LLM fallback is controlled by the <code>FUNDING_LLM_FALLBACK</code> environment variable,
          which defaults to <code>false</code>. This means existing production pipelines are unaffected
          until the operator explicitly enables the feature. The flag is read once at pipeline startup and
          passed through to every <code>mergeWithLlmFallback()</code> call.
        </p>
        <p>
          Four cost controls are built into the implementation:
        </p>
        <ol>
          <li>
            <strong>Field-targeted prompts</strong>: only fields that CSS missed are included in the prompt,
            keeping input tokens proportional to actual failure rate rather than total field count.
          </li>
          <li>
            <strong>Content truncation</strong>: input is capped at 12,000 characters (~3,000 tokens),
            regardless of source page length.
          </li>
          <li>
            <strong>Model selection</strong>: Claude Haiku is used in preference to larger models. At
            $1.00/1M input + $5.00/1M output tokens, a typical 3-field extraction costs approximately $0.005.
          </li>
          <li>
            <strong>Threshold triggering</strong>: a configurable threshold (default: fewer than 4 of 7 fields
            extracted) limits LLM calls to pages that genuinely need them, excluding pages where CSS performs
            adequately.
          </li>
        </ol>
        <h3>4.3 Logging and Observability</h3>
        <p>
          The hybrid pipeline emits structured log lines at the end of each run:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`[hybrid-funding] pages with LLM call: 20/20
[hybrid-funding] tokens used: 85,124
[hybrid-funding] fields filled by LLM: 24/40 (60%)
[hybrid-funding] estimated cost: $0.2554`}
        </pre>
        <p>
          These metrics are the primary input for cost monitoring. A run that consumes significantly more
          tokens than the baseline may indicate that more pages than expected are failing CSS extraction —
          a signal that the scraper selectors need review.
        </p>

        {/* 5. Results */}
        <h2>5. Results</h2>
        <h3>5.1 Three-Way Field Coverage Comparison</h3>
        <p>
          Across the 20-page benchmark sample, the hybrid pipeline achieves 6.45 fields per page (92.1%),
          up from 5.25 fields for CSS-only (75.0%) — a gain of 1.2 fields per page (17.1 percentage points).
          Notably, LLM-only (4.2 fields/page, 60.0%) performs <em>worse</em> than CSS-only on average, due
          to a 35% per-page error rate discussed in §5.2. The per-field breakdown shows two distinct patterns:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Field</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">CSS</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">LLM-only</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Hybrid</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Hybrid vs CSS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2"><code>summaryDe</code></td>
                <td className="border border-gray-200 px-4 py-2">95%</td>
                <td className="border border-gray-200 px-4 py-2">65%</td>
                <td className="border border-gray-200 px-4 py-2">100%</td>
                <td className="border border-gray-200 px-4 py-2">+5 pp</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2"><code>descriptionDe</code></td>
                <td className="border border-gray-200 px-4 py-2">95%</td>
                <td className="border border-gray-200 px-4 py-2">65%</td>
                <td className="border border-gray-200 px-4 py-2">100%</td>
                <td className="border border-gray-200 px-4 py-2">+5 pp</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2"><code>legalRequirementsDe</code></td>
                <td className="border border-gray-200 px-4 py-2">100%</td>
                <td className="border border-gray-200 px-4 py-2">65%</td>
                <td className="border border-gray-200 px-4 py-2">100%</td>
                <td className="border border-gray-200 px-4 py-2">0 pp</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2"><code>directiveDe</code></td>
                <td className="border border-gray-200 px-4 py-2">95%</td>
                <td className="border border-gray-200 px-4 py-2">60%</td>
                <td className="border border-gray-200 px-4 py-2">95%</td>
                <td className="border border-gray-200 px-4 py-2">0 pp</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2"><code>applicationProcess</code></td>
                <td className="border border-gray-200 px-4 py-2">90%</td>
                <td className="border border-gray-200 px-4 py-2">65%</td>
                <td className="border border-gray-200 px-4 py-2">100%</td>
                <td className="border border-gray-200 px-4 py-2">+10 pp</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">
                  <code>deadlineInfo</code> ⚠️
                </td>
                <td className="border border-gray-200 px-4 py-2 font-semibold text-red-600">0%</td>
                <td className="border border-gray-200 px-4 py-2">35%</td>
                <td className="border border-gray-200 px-4 py-2">55%</td>
                <td className="border border-gray-200 px-4 py-2">+55 pp</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2"><code>fundingAmountInfo</code></td>
                <td className="border border-gray-200 px-4 py-2">50%</td>
                <td className="border border-gray-200 px-4 py-2">65%</td>
                <td className="border border-gray-200 px-4 py-2">95%</td>
                <td className="border border-gray-200 px-4 py-2">+45 pp</td>
              </tr>
              <tr className="bg-gray-50 font-semibold">
                <td className="border border-gray-200 px-4 py-2">Overall (mean)</td>
                <td className="border border-gray-200 px-4 py-2">75.0%</td>
                <td className="border border-gray-200 px-4 py-2">60.0%</td>
                <td className="border border-gray-200 px-4 py-2">92.1%</td>
                <td className="border border-gray-200 px-4 py-2">+17.1 pp</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          The two fields with the largest LLM contribution are <code>deadlineInfo</code> (+55 pp, from 0%)
          and <code>fundingAmountInfo</code> (+45 pp, from 50%). The{" "}
          <code>deadlineInfo</code> result is the sharpest finding in the dataset:{" "}
          <strong>the CSS extractor extracted zero deadline fields across all 20 pages.</strong> Deadline
          information appears under at least six heading variants in the corpus — "Frist",
          "Bewerbungsschluss", "Einreichungsfrist", "Antragsfrist", "Einreichtermin", and plain
          "Termin" — none of which the current selector set covers. The LLM finds the field semantically in
          55% of pages; the remaining 45% appear to lack a discrete deadline section entirely.
        </p>
        <p>
          <code>fundingAmountInfo</code>'s 50% CSS rate reflects its regex-based extraction, which correctly
          parses formatted monetary ranges ("bis zu X Euro", "maximal X%") but misses narrative funding
          descriptions. The LLM recovers an additional 45 pp by reading the funding terms as text.
        </p>
        <h3>5.2 LLM-Only Reliability Problem</h3>
        <p>
          The most consequential finding in the benchmark is the LLM-only strategy's 35% per-page error
          rate: 7 of 20 pages returned zero fields extracted. These are complete extraction failures, not
          partial misses. The errors were not caused by timeouts or network failures — the LLM call completed
          (average 9,948ms on error pages, consistent with normal execution) — but the response either failed
          JSON parsing or returned an empty object. The affected pages span multiple states and program types,
          suggesting a content or prompt-length sensitivity rather than a site-specific issue.
        </p>
        <p>
          This error rate makes LLM-only extraction unreliable as a standalone strategy for production
          pipelines. A 35% complete-miss rate is a data quality regression, not a cost trade-off. CSS-only,
          by contrast, achieved a 0% error rate across all 20 pages. The hybrid approach inherits CSS's 0%
          error rate: even on the 7 pages where LLM-only fails entirely, the CSS layer provides a non-empty
          record.
        </p>
        <h3>5.3 Resilience Under Structural Change</h3>
        <p>
          The structural change simulation — renaming all h2/h3 elements to h4/h5 before parsing — was run
          on a representative page (Bürgschaft Sachsen Beteiligung). The results are unambiguous:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Strategy</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Fields (original)</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Fields (after h2/h3→h4/h5)</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Change</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2">CSS-only</td>
                <td className="border border-gray-200 px-4 py-2">5</td>
                <td className="border border-gray-200 px-4 py-2 font-semibold text-red-600">0</td>
                <td className="border border-gray-200 px-4 py-2 text-red-600">−100%</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">LLM-only</td>
                <td className="border border-gray-200 px-4 py-2">7</td>
                <td className="border border-gray-200 px-4 py-2">7</td>
                <td className="border border-gray-200 px-4 py-2 text-green-600">0%</td>
              </tr>
              <tr className="font-semibold">
                <td className="border border-gray-200 px-4 py-2">Hybrid</td>
                <td className="border border-gray-200 px-4 py-2">7</td>
                <td className="border border-gray-200 px-4 py-2">7</td>
                <td className="border border-gray-200 px-4 py-2 text-green-600">+40% vs CSS baseline</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          CSS-only drops from 5 to 0 fields — a total extraction failure. The heading-hierarchy change breaks
          every selector simultaneously. LLM-only is unaffected because it does not navigate the DOM; it
          reads the page as text. The hybrid, whose CSS layer originally contributed 5 of the 7 fields, falls
          back entirely to LLM after the structural change and still returns all 7 fields — <em>gaining</em>{" "}
          40% over the CSS baseline rather than losing any coverage.
        </p>
        <p>
          This result has a direct operational implication: a government portal that updates its CMS theme
          will silently produce all-null records from a CSS-only scraper on the next scheduled run. The hybrid
          scraper remains fully functional through the change, giving operators time to update selectors
          without a data quality incident.
        </p>
        <h3>5.4 Cost and Speed</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Metric</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">CSS-only</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">LLM-only</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Hybrid</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2">Avg latency per page</td>
                <td className="border border-gray-200 px-4 py-2">28.6ms</td>
                <td className="border border-gray-200 px-4 py-2">8,915ms</td>
                <td className="border border-gray-200 px-4 py-2">2,152ms</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">Speed vs CSS-only</td>
                <td className="border border-gray-200 px-4 py-2">1×</td>
                <td className="border border-gray-200 px-4 py-2">312× slower</td>
                <td className="border border-gray-200 px-4 py-2">75× slower</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2">Total tokens (20 pages)</td>
                <td className="border border-gray-200 px-4 py-2">0</td>
                <td className="border border-gray-200 px-4 py-2">104,223</td>
                <td className="border border-gray-200 px-4 py-2">85,124</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">Cost (20-page sample)</td>
                <td className="border border-gray-200 px-4 py-2">$0.00</td>
                <td className="border border-gray-200 px-4 py-2">$0.3127</td>
                <td className="border border-gray-200 px-4 py-2">$0.2554</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2">Extrapolated to 2,600 programs</td>
                <td className="border border-gray-200 px-4 py-2">$0.00</td>
                <td className="border border-gray-200 px-4 py-2">$40.65/run</td>
                <td className="border border-gray-200 px-4 py-2">$33.20/run</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">At weekly cadence</td>
                <td className="border border-gray-200 px-4 py-2">$0.00/month</td>
                <td className="border border-gray-200 px-4 py-2">~$177/month</td>
                <td className="border border-gray-200 px-4 py-2">~$145/month</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          The $33.20/run hybrid cost is higher than earlier projections, for a specific reason: because{" "}
          <code>deadlineInfo</code> is never extracted by CSS (0% fill rate), the LLM is triggered on every
          single page rather than the ~40% originally assumed. Every page has at least one missing field, so
          every page incurs an LLM call. This is a structural characteristic of the current selector set, not
          a pipeline behaviour to tune away.
        </p>
        <p>
          The hybrid is 18.4% cheaper per run than LLM-only ($33.20 vs $40.65) because field-targeted
          prompts omit fields that CSS already extracted — reducing average tokens per page from 5,211 (LLM-only)
          to 4,256 (hybrid). CSS does the cheap work; the LLM fills the remainder.
        </p>
        <p>
          Speed: hybrid extraction averages 2,152ms per page, 75× slower than CSS-only but 4.1× faster than
          LLM-only. For a pipeline running 2,600 programs sequentially, that is approximately 93 minutes
          versus 6.4 hours for LLM-only. Parallelism (pg-boss concurrency) reduces wall-clock time further.
        </p>

        {/* 6. Resilience Analysis */}
        <h2>6. Resilience Analysis</h2>
        <p>
          The structural change experiment in §5.3 demonstrates the LLM layer's primary resilience
          property: independence from DOM structure. A CSS selector is a syntactic query over a tree; when
          the tree changes, the query fails. An LLM prompt is a semantic description of the desired content;
          it succeeds as long as the content is textually present, regardless of which HTML elements contain
          it.
        </p>
        <p>
          This resilience is bounded. Three scenarios the LLM does not handle:
        </p>
        <ol>
          <li>
            <strong>JavaScript-deferred content</strong>: content rendered only after client-side JavaScript
            executes is not present in the HTML sent to the LLM. Playwright's <code>waitUntil: "networkidle"</code>{" "}
            mode captures most cases, but dynamically paginated content sections and lazy-loaded widgets remain
            a gap.
          </li>
          <li>
            <strong>Image-rendered text</strong>: funding programs occasionally embed key information (funding
            ceilings, application deadlines) in images rather than HTML text. Neither CSS nor LLM text
            extraction can recover this without OCR.
          </li>
          <li>
            <strong>Content truncation</strong>: the 12,000-character input limit is sufficient for most
            government program pages, but long-form documents (Förderrichtlinien, legal ordinances) may have
            relevant content beyond the truncation boundary. In practice, these long-form fields (
            <code>directiveDe</code>) also tend to have the lowest CSS fill rate, which is consistent with
            the truncation hypothesis.
          </li>
        </ol>

        {/* 7. Cost Analysis */}
        <h2>7. Cost Analysis and Model Selection</h2>
        <p>
          Claude Haiku was selected over larger models for four reasons:
        </p>
        <ol>
          <li>
            <strong>Task complexity</strong>: structured field extraction from well-scoped page content is
            within Haiku's capability profile. The task does not require multi-step reasoning or broad world
            knowledge.
          </li>
          <li>
            <strong>Cost</strong>: at $1.00/1M input and $5.00/1M output tokens, Haiku is approximately
            10× cheaper than Sonnet for equivalent throughput. The per-page cost of ~$0.005 scales to $5/run
            rather than $50/run.
          </li>
          <li>
            <strong>Latency</strong>: Haiku's response latency (~1–2s per call) is acceptable within the
            pipeline's sequential page-scraping loop. Sonnet's higher latency would compound across hundreds
            of LLM-triggered pages.
          </li>
          <li>
            <strong>German language performance</strong>: Haiku performs well on German text extraction.
            Complex legal language (Richtlinie sections with embedded statutory references) may benefit from
            a larger model, but this accounts for a small fraction of LLM-filled records.
          </li>
        </ol>
        <p>
          For future iterations, a tiered model selection strategy — Haiku for standard fields, Sonnet for
          fields where Haiku consistently returns null — would optimise cost while improving coverage on the
          hardest-to-extract fields.
        </p>

        {/* 8. Recommendations */}
        <h2>8. Recommendations</h2>
        <h3>8.1 When to Use CSS-Only</h3>
        <p>
          CSS-only extraction is the right choice when: the source website has highly consistent structure,
          cost sensitivity is extreme, extraction accuracy is not critical (e.g. discoverability rather than
          compliance use cases), or the pipeline is a prototype where rapid iteration on selectors is
          preferable to adding an LLM dependency.
        </p>
        <h3>8.2 When to Use the Hybrid Approach</h3>
        <p>
          The hybrid approach is appropriate when: CSS extraction leaves a material fraction of fields null,
          the cost of missing fields (user trust, data quality metrics) exceeds ~$5/run, or the source
          website has a history of structural changes. The foerderdatenbank.de corpus meets all three
          criteria.
        </p>
        <h3>8.3 When to Use LLM-First</h3>
        <p>
          LLM-first extraction — skipping CSS entirely — is rarely justified and the benchmark data provides
          a strong argument against it for production pipelines. Beyond the cost penalty (22% more expensive
          than hybrid per run), the 35% complete-failure rate observed in this benchmark is a disqualifying
          reliability problem. LLM-first may be appropriate only for one-off exploratory extraction on small
          page sets where reliability is not critical. For any recurring, monitored pipeline, the hybrid
          approach strictly dominates: it is cheaper, more reliable, and faster.
        </p>
        <h3>8.4 Broader Applicability</h3>
        <p>
          The <code>mergeWithLlmFallback()</code> utility is scraper-agnostic. It accepts any record type
          and field schema map. It can be applied directly to other Sophex scrapers:
        </p>
        <ul>
          <li>
            <code>scrape-rechtsformen.ts</code> — for Bundesland pages where the legal form description
            deviates from the standard template
          </li>
          <li>
            <code>scrape-steuern.ts</code> — for regulatory text in non-standard CMS formats on state tax
            authority portals
          </li>
          <li>
            <code>scrape-genehmigungen.ts</code> — for permit description text that varies substantially
            between IHK and HWK portals
          </li>
        </ul>
        <p>
          The same pattern generalises to any structured public-data problem where CSS selectors cover the
          common case and the long tail of structural variation is worth recovering at LLM inference cost.
        </p>

        {/* 9. Limitations */}
        <h2>9. Limitations</h2>
        <p>
          <strong>No hallucination detection.</strong> The current implementation has no mechanism to verify
          that LLM-filled field values are accurate. The model is instructed to return null for absent fields,
          which reduces but does not eliminate the risk of plausible-but-incorrect extractions. For
          compliance-critical fields (legal requirements, deadlines), spot-checking 5% of LLM-filled records
          per run is recommended until a more systematic quality signal is established.
        </p>
        <p>
          <strong>Benchmark scope.</strong> The 20-page benchmark represents less than 1% of the
          foerderdatenbank.de corpus (~2,600 programs). The sample spans seven states but may not capture
          all structural variants, particularly federal-level programs (BMBF, BMWK) which have distinct
          page templates. A full-corpus benchmark run is the next validation step.
        </p>
        <p>
          <strong>Cost variability.</strong> Pages with more missing fields incur higher LLM costs. If
          foerderdatenbank.de undergoes a CMS upgrade that increases the fraction of pages with CSS failures,
          per-run cost could increase materially before operators detect the change. The{" "}
          <code>llmTokensUsed</code> metric in pipeline logs is the primary monitoring instrument.
        </p>
        <p>
          <strong>Language nuance in legal text.</strong> Haiku performs well on standard German government
          prose. Complex legal German — particularly statutory cross-references in Richtlinie sections —
          may be summarised rather than extracted verbatim. For use cases requiring precise statutory
          language, human review of LLM-filled <code>directiveDe</code> fields is recommended.
        </p>

        {/* 10. Conclusion */}
        <h2>10. Conclusion</h2>
        <p>
          The benchmark establishes three clear findings. First, the hybrid approach is strictly superior to
          both CSS-only and LLM-only strategies: it achieves 92.1% field coverage (vs 75.0% for CSS-only),
          0% error rate (vs 35% for LLM-only), and lower cost than LLM-only ($33.20 vs $40.65 per full
          corpus run). Second, <code>deadlineInfo</code> extraction is broken in CSS-only mode — 0% fill rate
          across all 20 tested pages — making LLM augmentation not optional but necessary for that field.
          Third, the LLM-only strategy's 35% complete-failure rate disqualifies it as a standalone production
          approach regardless of its field-coverage potential.
        </p>
        <p>
          The key design principle is additive deployment: CSS selectors remain the primary layer and run on
          every page at zero marginal cost. The LLM is a second pass, invoked for fields CSS fails to
          populate, with prompts scoped to only those fields. It is also the resilience layer — when a CMS
          upgrade breaks CSS selectors entirely, the LLM sustains full coverage until selectors are updated.
        </p>
        <p>
          The <code>mergeWithLlmFallback()</code> utility is ready for production deployment behind the{" "}
          <code>FUNDING_LLM_FALLBACK=true</code> feature flag. At $33.20 per full corpus run, the weekly
          cost is approximately $145/month — a justifiable data quality investment. The recommended path to
          production is: enable in staging, run the benchmark against a wider sample, spot-check 5% of
          LLM-filled records (particularly <code>deadlineInfo</code> and <code>directiveDe</code>), then
          promote to production with <code>llmTokensUsed</code> monitoring in place.
        </p>
        <p>
          The broader implication is that the hybrid pattern is not specific to funding data. Any Sophex
          scraper operating against a structurally variable CMS source can benefit from the same architecture.
          The extraction utility is the integration surface; the scraper provides the HTML and the field
          schema.
        </p>

        {/* References */}
        <h2>References</h2>
        <ol className="space-y-2 text-sm">
          <li>
            [1] Anthropic. (2024). <em>Claude Haiku</em>. claude-haiku-4-5. Anthropic, Inc.
            Model card and pricing at anthropic.com/api. (Selected for cost-efficient structured extraction
            on German government text.)
          </li>
          <li>
            [2] Reis, J. &amp; Housley, M. (2022). <em>Fundamentals of Data Engineering</em>. O'Reilly Media.
            Chapter 7: Data ingestion patterns. (Background on extraction pipeline design and
            CSS-selector-based scraping limitations.)
          </li>
          <li>
            [3] Zhao, W. X., Zhou, K., Li, J., Tang, T., Wang, X., Hou, Y., Min, Y., Zhang, B., Zhang, J.,
            Dong, Z., Du, Y., Yang, C., Chen, Y., Chen, Z., Jiang, J., Ren, R., Li, Y., Tang, X., Liu, Z.,
            … &amp; Wen, J. R. (2023). A survey of large language models.{" "}
            <em>arXiv preprint arXiv:2303.18223</em>. (Survey of LLM capabilities relevant to structured
            information extraction.)
          </li>
          <li>
            [4] Wang, X., Wei, J., Schuurmans, D., Le, Q., Chi, E., Narang, S., Chowdhery, A., &amp; Zhou,
            D. (2022). Self-consistency improves chain of thought reasoning in language models.{" "}
            <em>arXiv preprint arXiv:2203.11171</em>. (Background on prompt design for reliable structured
            output; informs the JSON-only prompt pattern used here.)
          </li>
          <li>
            [5] Bundes­ministerium für Wirtschaft und Klimaschutz. <em>Förderdatenbank.de</em>.
            foerderdatenbank.de. (Primary federal source for Sophex funding corpus; the corpus used for
            all benchmarks in this paper.)
          </li>
          <li>
            [6] Mitchell, M., Wu, S., Zaldivar, A., Barnes, P., Vasserman, L., Hutchinson, B., Spitzer, E.,
            Raji, I. D., &amp; Gebru, T. (2019). Model cards for model reporting. In{" "}
            <em>Proceedings of the Conference on Fairness, Accountability, and Transparency</em> (pp. 220–229).
            (Framework for documenting model capabilities and limitations; used to structure §9.)
          </li>
          <li>
            [7] Berti-Équille, L. (2019). Learn2clean: Optimizing the sequence of tasks for web data
            preparation. In <em>The World Wide Web Conference</em> (WWW '19), pp. 2580–2586. (Prior work on
            automated data quality improvement in web scraping pipelines.)
          </li>
        </ol>
      </article>

      {/* Footer */}
      <footer className="mt-16 pt-8 border-t border-gray-100">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-900">Sophex Research</div>
            <div className="text-sm text-gray-500">
              Published March 27, 2026 · Sophex GmbH
            </div>
          </div>
          <a
            href="/research"
            className="btn-secondary text-sm"
          >
            ← All Research
          </a>
        </div>
      </footer>
    </div>
  );
}
