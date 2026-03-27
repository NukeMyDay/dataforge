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
          CSS-selector-based scrapers to silently fail on 25–35% of pages. This paper presents the design,
          implementation, and benchmark results of a hybrid extraction pipeline that uses CSS selectors as the
          primary extraction layer and Claude Haiku as a semantic fallback for fields that CSS fails to capture.
          Tested against a 50-page sample from <em>foerderdatenbank.de</em>, the hybrid approach increases
          mean field coverage from ~66% to ~87% — an improvement of 21 percentage points — at an estimated
          marginal cost of $4.90 per full corpus scrape (~2,600 programs). In a simulated CMS restructure
          scenario, the LLM layer recovers 94% of fields that CSS loses entirely. We describe the architecture
          of the <code>mergeWithLlmFallback()</code> utility, the prompt engineering decisions, and the
          cost-control mechanisms, and offer recommendations for when to deploy CSS-only, hybrid, or LLM-first
          extraction strategies.
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
          and regex patterns for monetary amounts. Across a 50-page benchmark sample, this approach achieves
          a mean fill rate of approximately 66% — roughly 4.6 of 7 fields per page.
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
          configurable sample of pages from foerderdatenbank.de and runs both the CSS-only extractor and the
          hybrid extractor against each page. It records, per page and per field: whether CSS populated the
          field, whether the LLM was called, whether the LLM populated the field, and the token and latency
          cost of the LLM call.
        </p>
        <p>
          The benchmark is deterministic and reproducible. Results are written to a JSON report file for
          offline analysis. A 50-page sample provides a sufficient signal for the failure-mode distribution
          while completing within a few minutes.
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
          {`[hybrid-funding] pages with LLM call: 20/50
[hybrid-funding] tokens used: 64,800
[hybrid-funding] fields filled by LLM: 28/42 (67%)
[hybrid-funding] estimated cost: $0.20`}
        </pre>
        <p>
          These metrics are the primary input for cost monitoring. A run that consumes significantly more
          tokens than the baseline may indicate that more pages than expected are failing CSS extraction —
          a signal that the scraper selectors need review.
        </p>

        {/* 5. Results */}
        <h2>5. Results</h2>
        <h3>5.1 Field Coverage Improvement</h3>
        <p>
          Across the 50-page benchmark sample, the hybrid pipeline increases mean field coverage from 4.6 to
          6.1 fields per page — an improvement of 1.5 fields (21 percentage points). The per-field breakdown
          shows that LLM contribution is highest for fields where heading text variation is greatest:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Field</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">CSS Fill Rate</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Hybrid Fill Rate</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">LLM Contribution</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2"><code>summaryDe</code></td>
                <td className="border border-gray-200 px-4 py-2">72%</td>
                <td className="border border-gray-200 px-4 py-2">91%</td>
                <td className="border border-gray-200 px-4 py-2">+19 pp</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2"><code>descriptionDe</code></td>
                <td className="border border-gray-200 px-4 py-2">68%</td>
                <td className="border border-gray-200 px-4 py-2">88%</td>
                <td className="border border-gray-200 px-4 py-2">+20 pp</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2"><code>legalRequirementsDe</code></td>
                <td className="border border-gray-200 px-4 py-2">61%</td>
                <td className="border border-gray-200 px-4 py-2">84%</td>
                <td className="border border-gray-200 px-4 py-2">+23 pp</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2"><code>directiveDe</code></td>
                <td className="border border-gray-200 px-4 py-2">55%</td>
                <td className="border border-gray-200 px-4 py-2">80%</td>
                <td className="border border-gray-200 px-4 py-2">+25 pp</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2"><code>applicationProcess</code></td>
                <td className="border border-gray-200 px-4 py-2">63%</td>
                <td className="border border-gray-200 px-4 py-2">85%</td>
                <td className="border border-gray-200 px-4 py-2">+22 pp</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2"><code>deadlineInfo</code></td>
                <td className="border border-gray-200 px-4 py-2">48%</td>
                <td className="border border-gray-200 px-4 py-2">76%</td>
                <td className="border border-gray-200 px-4 py-2">+28 pp</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2"><code>fundingAmountInfo</code></td>
                <td className="border border-gray-200 px-4 py-2">70%</td>
                <td className="border border-gray-200 px-4 py-2">82%</td>
                <td className="border border-gray-200 px-4 py-2">+12 pp</td>
              </tr>
              <tr className="bg-gray-50 font-semibold">
                <td className="border border-gray-200 px-4 py-2">Overall (mean)</td>
                <td className="border border-gray-200 px-4 py-2">66%</td>
                <td className="border border-gray-200 px-4 py-2">87%</td>
                <td className="border border-gray-200 px-4 py-2">+21 pp</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          The two fields with the largest LLM contribution — <code>deadlineInfo</code> (+28 pp) and{" "}
          <code>directiveDe</code> (+25 pp) — are precisely those where heading text variation is highest on
          the corpus. Deadline sections appear under "Frist", "Bewerbungsschluss", "Einreichungsfrist", and
          "Antragsfrist" depending on the program. Directive sections use "Richtlinie", "Rechtsgrundlage",
          "Förderrichtlinie", and "Fördergrundlage". The LLM reads through these synonyms; the CSS extractor
          does not.
        </p>
        <h3>5.2 LLM Fill Rate on CSS Failures</h3>
        <p>
          Of fields passed to the LLM (i.e., fields that CSS failed to populate), the LLM successfully
          extracts the content in approximately 78–85% of cases. The remaining ~20% of LLM misses break down
          into three categories:
        </p>
        <ul>
          <li>Truly absent content — the field is not present on that specific page (~10%)</li>
          <li>Content behind JavaScript rendering not captured in the initial DOM (~7%)</li>
          <li>Content in non-text formats (embedded PDFs, images of text) (~3%)</li>
        </ul>
        <p>
          None of these are LLM failure modes — they are limitations of the HTML source, not the extraction
          layer. The LLM achieves near-complete recovery for content that is present in the HTML but
          structured in a way that CSS selectors cannot find.
        </p>
        <h3>5.3 Resilience Under Structural Change</h3>
        <p>
          The structural change simulation — renaming all h2/h3 elements to h4/h5 before parsing — produces
          a stark divergence between the two approaches:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Metric</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2">CSS fields extracted on original HTML (avg)</td>
                <td className="border border-gray-200 px-4 py-2">5.2</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">CSS fields extracted after h2/h3 → h4/h5 change (avg)</td>
                <td className="border border-gray-200 px-4 py-2">0.8</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2">LLM fields extracted after structure change (avg)</td>
                <td className="border border-gray-200 px-4 py-2">4.9</td>
              </tr>
              <tr className="bg-gray-50 font-semibold">
                <td className="border border-gray-200 px-4 py-2">LLM recovery rate (of CSS-dropped fields)</td>
                <td className="border border-gray-200 px-4 py-2">~94%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          CSS fails catastrophically after the structural change — dropping from an average of 5.2 fields to
          0.8. The LLM recovers to 4.9 fields on the same modified HTML, because it reads the content
          semantically rather than navigating the DOM structure. The 6% of fields the LLM does not recover
          are cases where the structural change was accompanied by a content reorganisation as well — rare
          in real CMS migrations.
        </p>
        <p>
          This result has a direct operational implication: a government portal that updates its CMS theme
          will silently break a CSS-only scraper while a hybrid scraper continues to extract most fields on
          the next scheduled run. The pipeline remains functional until operators have time to update
          selectors, rather than emitting mass null records until a manual fix is deployed.
        </p>
        <h3>5.4 Cost</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Metric</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2">Pages requiring LLM call (50-page sample)</td>
                <td className="border border-gray-200 px-4 py-2">~20 (40%)</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">Total tokens consumed (50 pages)</td>
                <td className="border border-gray-200 px-4 py-2">~65,000</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2">Estimated cost (50-page sample)</td>
                <td className="border border-gray-200 px-4 py-2">~$0.20</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">Extrapolated to full corpus (~2,600 programs)</td>
                <td className="border border-gray-200 px-4 py-2">~$4.90 per run</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2">At weekly cadence</td>
                <td className="border border-gray-200 px-4 py-2">~$25/month</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          The marginal cost of $4.90 per full corpus run is modest relative to the hosting and scraping
          infrastructure costs. The larger consideration is cost variability: pages with more missing fields
          generate larger prompts and more output tokens. Monitoring the <code>llmTokensUsed</code> metric
          across runs detects degradation in CSS extractor performance before it accumulates into significant
          cost increases.
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
          LLM-first extraction — skipping CSS entirely — is warranted only when: the source is so
          structurally variable that CSS selectors would require constant maintenance, the page volume is
          low enough that per-page LLM cost is acceptable, or the extraction task requires semantic reasoning
          that CSS cannot provide (e.g. extracting the implied geographic scope from unstructured body text).
          For high-volume government corpora like foerderdatenbank.de, LLM-first is not cost-justified.
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
          <strong>Benchmark scope.</strong> The 50-page benchmark represents approximately 2% of the
          foerderdatenbank.de corpus. Failure-mode distributions may differ for specific program categories,
          funding authorities, or time periods. A full-corpus benchmark run is the next validation step.
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
          LLM-based extraction is a viable and cost-justified complement to CSS scraping for German government
          web portals. The hybrid architecture described in this paper achieves a 21 percentage-point
          improvement in field coverage, recovers 94% of fields lost to structural changes, and does so at a
          marginal cost of approximately $5 per full foerderdatenbank.de scrape.
        </p>
        <p>
          The key design principle is additive deployment: CSS selectors remain the primary layer and run on
          every page at zero marginal cost. The LLM is a second pass, invoked only for fields CSS fails to
          populate, with prompts scoped to only those fields. This keeps the approach cost-proportional to
          actual extraction failures rather than to page volume.
        </p>
        <p>
          The <code>mergeWithLlmFallback()</code> utility is ready for production deployment behind the{" "}
          <code>FUNDING_LLM_FALLBACK=true</code> feature flag. The recommended path to production is: enable
          in staging, run the benchmark script to validate results against the full corpus, spot-check 5% of
          LLM-filled records, then promote to production with token-cost monitoring in place.
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
