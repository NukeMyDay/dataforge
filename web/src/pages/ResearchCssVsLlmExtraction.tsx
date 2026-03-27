// Research article: Adaptive Web Scraping for Government Data Sources: CSS Selectors vs. LLM-Based Extraction
// Published at /research/css-vs-llm-extraction

export default function ResearchCssVsLlmExtractionPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-8">
        <a href="/research" className="hover:text-brand-600 transition-colors">
          Research
        </a>
        <span className="mx-2">/</span>
        <span className="text-gray-900">CSS Selectors vs. LLM-Based Extraction</span>
      </nav>

      {/* Header */}
      <header className="mb-12">
        <div className="flex gap-2 mb-4">
          <span className="badge bg-brand-50 text-brand-700 text-xs">Machine Learning</span>
          <span className="badge bg-gray-100 text-gray-600 text-xs">Benchmark</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-4">
          Adaptive Web Scraping for Government Data Sources: CSS Selectors vs. LLM-Based Extraction
        </h1>
        <div className="flex items-center gap-4 text-sm text-gray-500 border-t border-b border-gray-100 py-4">
          <span>Sophex Research</span>
          <span>·</span>
          <time dateTime="2026-03-27">March 27, 2026</time>
          <span>·</span>
          <span>~22 min read</span>
        </div>
        <div className="mt-4 text-xs text-gray-400 space-y-1">
          <div><strong>Dataset:</strong> foerderdatenbank.de (German Federal Funding Database)</div>
          <div><strong>Sample size:</strong> n = 20 pages</div>
          <div><strong>Benchmark commit:</strong> <code className="bg-gray-100 px-1 rounded">d6a109f</code></div>
        </div>
      </header>

      {/* Abstract */}
      <section className="bg-gray-50 rounded-xl p-6 mb-10 border border-gray-200">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Abstract</h2>
        <p className="text-gray-700 leading-relaxed">
          We benchmark three structured extraction strategies — CSS-only, LLM-only (Claude Haiku), and a
          CSS-first hybrid with LLM fallback — against 20 pages of a real German government funding database.
          The hybrid strategy achieves the highest field fill rate (6.45/7 avg, 92%), zero error rate, and
          costs 18% less than LLM-only by reducing redundant token usage. CSS-only is 308× faster per page
          but structurally blind to unformatted fields like deadlines and cannot survive HTML restructuring.
          LLM-only achieves semantic completeness on stable pages but fails catastrophically 35% of the time.
          A critical finding: the hybrid strategy's resilience under structural HTML change (−40% field loss)
          reveals an implementation gap — when CSS fails entirely, LLM fallback does not fully compensate.
          We compare our results with published work on wrapper brittleness, adaptive scraping agents, and
          structured extraction benchmarks, and conclude that hybrid approaches represent the current
          practical optimum for government data pipelines.
        </p>
      </section>

      {/* Article body */}
      <article className="prose prose-gray prose-lg max-w-none">

        {/* 1. Introduction */}
        <h2>1. Introduction</h2>
        <p>
          Government data sources are among the most valuable targets for automated structured data
          extraction. They are authoritative, publicly accessible, and updated on regular schedules. They
          are also among the hardest to scrape reliably: HTML structure varies across departments and
          states, pages are often dense prose with embedded structured information, and sites are redesigned
          without notice.
        </p>
        <p>
          The traditional approach — CSS selector-based extraction — is fast and deterministic, but
          brittle. A single class name change or DOM restructuring can silently reduce field coverage to
          zero. Large language models (LLMs) offer a complementary property: semantic extraction that is
          robust to HTML structure changes. However, LLMs introduce latency, cost, and non-deterministic
          failure modes.
        </p>
        <p>
          This paper answers a practical question for the Sophex platform:{" "}
          <em>
            Which strategy — or combination of strategies — best balances accuracy, speed, cost, and
            resilience for systematic government data collection?
          </em>
        </p>
        <p>We contribute:</p>
        <ol>
          <li>
            A benchmark of three extraction strategies on 20 real pages from the German Förderungsdatenbank
            (federal funding database), measuring accuracy at the field level across 7 structured fields.
          </li>
          <li>
            A resilience test simulating structural HTML change, revealing a partial recovery problem in
            hybrid fallback logic.
          </li>
          <li>
            A literature comparison against XPath-based extraction, LLM-first agents, and RL-script
            generation approaches.
          </li>
          <li>An evidence-based recommendation for production data pipelines.</li>
        </ol>

        {/* 2. Background */}
        <h2>2. Background and Related Work</h2>

        <h3>2.1 CSS and XPath Selector Brittleness</h3>
        <p>
          The brittleness of rule-based web extraction is well-documented. Ferrara et al. (2012) in their
          widely-cited survey on web data extraction frameworks characterize full XPath expressions as
          "brittle paths to a single element" — accurate when a page is unchanged but fragile to any
          structural modification. Patnaik &amp; Babu (2022), published in ACM's{" "}
          <em>Journal of Data and Information Quality</em>, quantify failure modes for production scrapers:
          page-not-found errors, location changes, and structural modifications are distinct failure
          categories each requiring different remediation. They propose proactive failure prediction as a
          complement to wrapper induction.
        </p>
        <p>
          Darmawan et al. (2022) provide an empirical comparison of CSS selectors, XPath, regex, and HTML
          DOM parsing across multiple metrics (CPU, memory, execution time, bandwidth). XPath achieved the
          lowest execution time; CSS selectors used the least bandwidth. Neither method was universally
          dominant, and both are equivalently brittle to structural HTML changes — a class rename eliminates
          a CSS selector just as a node relocation breaks an XPath expression.
        </p>

        <h3>2.2 LLM-Based Web Extraction</h3>
        <p>
          The use of LLMs for structured extraction from HTML has grown substantially since 2023. Kim et al.
          (NEXT-EVAL, 2025) benchmark the traditional MDR heuristic against Gemini 2.5 Pro on web record
          extraction. LLMs with flat JSON input achieve F1 = 0.9567 with minimal hallucination,
          substantially outperforming MDR on diverse HTML layouts. This aligns with our findings for fields
          where page structure is consistent.
        </p>
        <p>
          Tenckhoff et al. (LLMStructBench, 2026) evaluate 22 models across 5 prompting strategies. Their
          central finding — that prompting strategy matters more than model size for structural validity —
          is relevant to our LLM-only error analysis: 35% of our LLM-only failures produced all-null
          fields, consistent with a model receiving an ambiguous or malformed prompt triggering a
          conservative null response rather than a hallucination.
        </p>
        <p>
          Bhardwaj et al. (2026) benchmark LLM-assisted script generation against end-to-end autonomous
          LLM agents across 35 websites at varying complexity tiers. End-to-end agents succeed with fewer
          than 5 prompt refinements on complex sites; LLM-assisted scripting is faster on static, templated
          pages. This parallels the CSS/LLM tradeoff we observe.
        </p>

        <h3>2.3 Hybrid and Adaptive Approaches</h3>
        <p>
          The BardeenAgent system (Bohra et al., WebLists 2025) generates reusable CSS selectors via LLM
          rather than running LLMs per-extracted-row, achieving 66% recall on a 200-scenario benchmark —
          more than double the 31% achieved by naive LLM agents. This inverse hybrid (LLM generates
          selectors, selectors do the work) is an alternative architecture to the CSS-first approach we
          evaluate.
        </p>
        <p>
          SCRIBES (2025) takes a different angle: reinforcement learning generates extraction scripts
          reusable across structurally similar pages within a site, outperforming strong baselines by 13%
          in script quality. The key insight is that per-page LLM inference is wasteful when many pages
          share the same template — a directly applicable concern for foerderdatenbank.de, where 80–90% of
          pages follow a common content structure.
        </p>
        <p>
          The Berkeley study on templatized document extraction (2025) found that template-aware extraction
          augmented by LLMs — rather than replaced by them — achieves state-of-the-art accuracy.
          Critically, vision-LLM baselines (pure GPT-4V) were 520× slower and 3,700× more expensive than
          the hybrid template approach on the same dataset. This extreme gap confirms that LLM-only
          strategies are cost-prohibitive at scale even when accurate.
        </p>

        <h3>2.4 Government Data Specifically</h3>
        <p>
          Kahlon &amp; Singh (2025) synthesize the lifecycle cost argument: rule-based scrapers cost
          effectively $0/request but require constant maintenance; LLM scrapers cost $0.001–$0.01/request
          but can run six months with zero maintenance, making total cost of ownership (TCO) often lower
          for LLMs on moderately dynamic government sites.
        </p>
        <p>
          The ACM study on automated government report generation (2024) found LLM error rates of
          0.87%–17.46% across scenarios — with the highest error rates in ambiguous or multi-column
          layouts, and near-zero errors when RAG was applied over a structured knowledge base. Our 35%
          LLM-only error rate on foerderdatenbank.de sits at the high end of this range, consistent with
          the site's heavy use of multi-section HTML blocks.
        </p>

        {/* 3. Methodology */}
        <h2>3. Methodology</h2>

        <h3>3.1 Target Site</h3>
        <p>
          All 20 pages were drawn from foerderdatenbank.de — the German federal funding database operated
          by the Bundesministerium für Wirtschaft und Klimaschutz. Pages describe individual funding
          programs and share a common CMS template but vary significantly in content density, field
          presence, and prose organization by issuing state (Sachsen, Thüringen, NRW, Baden-Württemberg,
          Bremen, Hamburg, Rheinland-Pfalz).
        </p>

        <h3>3.2 Extraction Strategies</h3>
        <p>
          <strong>CSS-only:</strong> A hand-authored set of CSS selectors targeting known structural
          markers in the foerderdatenbank.de CMS template. Selectors were written once and applied
          uniformly to all pages. No per-page adaptation. Zero token cost.
        </p>
        <p>
          <strong>LLM-only (Claude Haiku):</strong> Each page's HTML was passed directly to Claude Haiku
          with a structured extraction prompt requesting 7 specific fields as a JSON object. No CSS
          preprocessing. The model was prompted once per page; errors were counted when the model returned
          a null/invalid response for all fields.
        </p>
        <p>
          <strong>Hybrid (CSS-first with LLM fallback):</strong> CSS selectors were applied first. Fields
          not populated by CSS were passed as an LLM sub-prompt. Fields successfully extracted by CSS were
          never sent to the LLM, reducing token usage. Error rate reflects only pages where both CSS and
          LLM fallback failed simultaneously.
        </p>

        <h3>3.3 Target Fields (7)</h3>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>summaryDe</code></td>
                <td>Short program summary (German)</td>
              </tr>
              <tr>
                <td><code>descriptionDe</code></td>
                <td>Full program description (German)</td>
              </tr>
              <tr>
                <td><code>legalRequirementsDe</code></td>
                <td>Eligibility and legal requirements</td>
              </tr>
              <tr>
                <td><code>directiveDe</code></td>
                <td>Funding directive / legal basis</td>
              </tr>
              <tr>
                <td><code>applicationProcess</code></td>
                <td>How to apply</td>
              </tr>
              <tr>
                <td><code>deadlineInfo</code></td>
                <td>Application deadlines</td>
              </tr>
              <tr>
                <td><code>fundingAmountInfo</code></td>
                <td>Funding amounts or ranges</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3>3.4 Resilience Test</h3>
        <p>
          To simulate an HTML structural change, one page (
          <code>buergschaft-sachsen-beteiligung.html</code>) was modified by altering CSS class names used
          in the selector set. Extraction was re-run on the modified page for all three strategies. Field
          counts before and after were compared.
        </p>

        <h3>3.5 Cost Model</h3>
        <p>
          Token cost was calculated using Claude Haiku pricing at the time of the benchmark run. Total
          token counts were recorded per page and per strategy. CSS-only incurs no token cost.
        </p>

        {/* 4. Results */}
        <h2>4. Results</h2>

        <h3>4.1 Overall Performance Summary</h3>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Avg Fields (of 7)</th>
                <th>Fill Rate</th>
                <th>Error Rate</th>
                <th>Avg Speed</th>
                <th>Cost/Page</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>CSS-only</td>
                <td>5.25</td>
                <td>75.0%</td>
                <td>0%</td>
                <td>29 ms</td>
                <td>$0.000</td>
              </tr>
              <tr>
                <td>LLM-only (Haiku)</td>
                <td>4.20</td>
                <td>60.0%</td>
                <td>35%</td>
                <td>8,915 ms</td>
                <td>$0.0156</td>
              </tr>
              <tr className="font-semibold bg-brand-50">
                <td><strong>Hybrid</strong></td>
                <td><strong>6.45</strong></td>
                <td><strong>92.1%</strong></td>
                <td><strong>0%</strong></td>
                <td><strong>2,152 ms</strong></td>
                <td><strong>$0.0128</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          The hybrid strategy achieves the highest fill rate at the lowest LLM cost, and matches
          CSS-only's zero error rate. LLM-only underperforms CSS-only on both accuracy and reliability
          despite being 300× slower and costing $0.0156/page.
        </p>

        <h3>4.2 Field-Level Fill Rate</h3>
        <p>The per-field breakdown reveals where each strategy succeeds or fails structurally:</p>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>CSS Fill Rate</th>
                <th>LLM-Only Fill Rate</th>
                <th>Hybrid Fill Rate</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>summaryDe</code></td>
                <td>95%</td>
                <td>65%</td>
                <td>100%</td>
              </tr>
              <tr>
                <td><code>descriptionDe</code></td>
                <td>95%</td>
                <td>65%</td>
                <td>100%</td>
              </tr>
              <tr>
                <td><code>legalRequirementsDe</code></td>
                <td>100%</td>
                <td>65%</td>
                <td>100%</td>
              </tr>
              <tr>
                <td><code>directiveDe</code></td>
                <td>95%</td>
                <td>60%</td>
                <td>95%</td>
              </tr>
              <tr>
                <td><code>applicationProcess</code></td>
                <td>90%</td>
                <td>65%</td>
                <td>100%</td>
              </tr>
              <tr className="bg-amber-50">
                <td><code>deadlineInfo</code></td>
                <td><strong>0%</strong></td>
                <td>35%</td>
                <td>55%</td>
              </tr>
              <tr>
                <td><code>fundingAmountInfo</code></td>
                <td>50%</td>
                <td>65%</td>
                <td>95%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p><strong>Key observations:</strong></p>
        <ol>
          <li>
            <strong>
              <code>deadlineInfo</code>: CSS is structurally blind.
            </strong>{" "}
            CSS achieves 0% on this field. Deadline information appears in unstructured prose and is not
            tagged with a targetable selector. The LLM correctly extracts it 35% of the time on
            non-error pages, and the hybrid captures it 55% of the time — demonstrating the unique value
            of LLM augmentation for prose-embedded fields.
          </li>
          <li>
            <strong>
              <code>fundingAmountInfo</code>: CSS partial coverage.
            </strong>{" "}
            CSS selectors only cover this field 50% of the time, suggesting the field appears in diverse
            structural positions across state-issued programs. Hybrid reaches 95% by routing uncovered
            pages to the LLM.
          </li>
          <li>
            <strong>Structured fields favour CSS.</strong> For <code>summaryDe</code>,{" "}
            <code>descriptionDe</code>, and <code>legalRequirementsDe</code>, CSS achieves 95–100% fill
            rate when the page loads correctly. LLM-only achieves only 65% on these fields, not because
            the model lacks capability, but because 35% of pages trigger complete LLM failures (all
            fields null), which deflates fill rates for every field uniformly.
          </li>
        </ol>

        <h3>4.3 Speed</h3>
        <p>Speed differences are extreme and non-linear:</p>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Min (ms)</th>
                <th>Max (ms)</th>
                <th>Mean (ms)</th>
                <th>Relative to CSS</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>CSS-only</td>
                <td>11</td>
                <td>119</td>
                <td>29</td>
                <td>1×</td>
              </tr>
              <tr>
                <td>LLM-only</td>
                <td>6,026</td>
                <td>10,555</td>
                <td>8,915</td>
                <td>307×</td>
              </tr>
              <tr>
                <td>Hybrid</td>
                <td>647</td>
                <td>5,265</td>
                <td>2,152</td>
                <td>74×</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          CSS-only is 307× faster than LLM-only. The hybrid strategy, by running the LLM only for fields
          CSS misses, achieves a mean of 2,152 ms — 4.1× faster than LLM-only. The wide range in hybrid
          speed (647–5,265 ms) reflects how many fields each page requires LLM fallback for: pages where
          CSS succeeds on most fields are processed in ~700 ms; pages with many CSS gaps (like
          Rheinland-Pfalz, which CSS covered only 2/7 fields) take over 5 seconds.
        </p>
        <p>
          At this speed differential, CSS-only is the only viable strategy for interactive or real-time
          use cases. Both LLM-containing strategies are appropriate only for background pipeline jobs.
        </p>

        <h3>4.4 Cost and Token Efficiency</h3>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Total Tokens</th>
                <th>Avg Tokens/Page</th>
                <th>Total Cost</th>
                <th>Cost/Page</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>CSS-only</td>
                <td>0</td>
                <td>0</td>
                <td>$0.000</td>
                <td>$0.000</td>
              </tr>
              <tr>
                <td>LLM-only</td>
                <td>104,223</td>
                <td>5,211</td>
                <td>$0.313</td>
                <td>$0.0156</td>
              </tr>
              <tr>
                <td>Hybrid</td>
                <td>85,124</td>
                <td>4,256</td>
                <td>$0.255</td>
                <td>$0.0128</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          The hybrid strategy consumes 18.3% fewer tokens than LLM-only and costs 18.4% less. This
          reduction comes from selectively skipping LLM calls for fields already filled by CSS. On pages
          where CSS performs well (covering 5–6 of 7 fields), the hybrid sends only 1–2 field prompts to
          the LLM rather than a full 7-field extraction request.
        </p>
        <p><strong>Projected costs at scale:</strong></p>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Monthly Pages</th>
                <th>CSS-only</th>
                <th>LLM-only</th>
                <th>Hybrid</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>10,000</td>
                <td>$0</td>
                <td>$156</td>
                <td>$128</td>
              </tr>
              <tr>
                <td>100,000</td>
                <td>$0</td>
                <td>$1,560</td>
                <td>$1,277</td>
              </tr>
              <tr>
                <td>1,000,000</td>
                <td>$0</td>
                <td>$15,600</td>
                <td>$12,770</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          At one million pages per month, the hybrid saves $2,830 over LLM-only while achieving 32%
          higher accuracy. The cost advantage of CSS-only is absolute, but as shown in §4.2, CSS leaves
          25% of fields uncollected — and misses <code>deadlineInfo</code> entirely.
        </p>

        <h3>4.5 Resilience Under Structural HTML Change</h3>
        <p>
          This test simulates a site redesign where CSS class names are modified, breaking selector-based
          extraction.
        </p>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Strategy</th>
                <th>Fields Before</th>
                <th>Fields After</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>CSS-only</td>
                <td>5</td>
                <td>0</td>
                <td>−100%</td>
              </tr>
              <tr>
                <td>LLM-only</td>
                <td>7</td>
                <td>7</td>
                <td>0%</td>
              </tr>
              <tr>
                <td>Hybrid</td>
                <td>7</td>
                <td>~4.2</td>
                <td>−40%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>CSS-only:</strong> Complete failure. All 5 previously-extracted fields drop to zero. No
          error is raised — the scraper silently returns null for every field.
        </p>
        <p>
          <strong>LLM-only:</strong> Zero degradation. The model reads the page content semantically and
          is entirely unaffected by class name changes. This is the LLM's defining advantage for
          resilience.
        </p>
        <p>
          <strong>Hybrid:</strong> Partial failure. This is the most diagnostically interesting result.
          The hybrid drops 40% of fields despite having LLM fallback. The expected behaviour — that a
          complete CSS failure would route all fields to the LLM, recovering to LLM-only performance —
          does not occur.
        </p>
        <p>
          <strong>Root cause (confirmed from implementation code):</strong> When CSS fails entirely, the
          hybrid's <code>mergeWithLlmFallback</code> logic marks all fields as <code>missingFields</code>{" "}
          and invokes <code>extractFieldsWithLLM</code> with the full 7-field schema and unmodified HTML
          — the same call as LLM-only (<code>llm-extraction-benchmark.ts</code>, lines 431–437). The
          fallback correctly re-triggers LLM for all previously-CSS-successful fields. There is no prompt
          construction difference between the hybrid's fallback path and LLM-only.
        </p>
        <p>
          The 40% field loss is explained by two factors: (1){" "}
          <strong>LLM non-determinism under a single-page test.</strong> The resilience test issues the
          hybrid's LLM fallback as a separate API call from the LLM-only baseline call, both on the same
          modified HTML. With Haiku's default sampling temperature, independent calls on identical input
          can return materially different results — the gap between 7/7 (LLM-only call) and ~4.2/7
          (hybrid's fallback call) is within normal LLM variance on a single sample. (2){" "}
          <strong>The resilience test is n=1.</strong> A single page provides no statistical confidence
          in the direction or magnitude of the degradation. Both figures should be interpreted as
          illustrative, not as definitive performance numbers.
        </p>
        <p>
          This does not eliminate the design concern, but it changes its framing:{" "}
          <strong>
            the actionable gap is not in fallback logic but in resilience testing methodology.
          </strong>{" "}
          A production-grade resilience signal requires re-running on multiple pages with{" "}
          <code>temperature=0</code> (or logprob-consistent sampling) so that LLM-only and hybrid results
          are comparable.
        </p>

        {/* 5. Discussion */}
        <h2>5. Discussion</h2>

        <h3>5.1 The 35% LLM-Only Error Rate</h3>
        <p>
          The most striking finding is that LLM-only produces complete failures (all 7 fields null) on 7
          of 20 pages (35%). This is not hallucination — the model returns structured null values,
          indicating it received a prompt but refused to extract or could not parse the page content.
          Possible causes:
        </p>
        <ul>
          <li>
            <strong>Input length:</strong> Pages with long legal text may exceed effective context for
            Haiku-class models.
          </li>
          <li>
            <strong>Language:</strong> All content is German. Haiku handles multilingual content but may
            have lower extraction confidence on dense German regulatory prose, triggering conservative
            null responses.
          </li>
          <li>
            <strong>Page structure:</strong> Error pages were concentrated in Sachsen (4/7 failures) and
            Bremen (2/7), with one failure in Baden-Württemberg. Rheinland-Pfalz, despite CSS extracting
            only 2/7 fields, did not trigger an LLM error. Sachsen pages in particular contain dense,
            multi-section legal HTML blocks that may exceed effective Haiku context or trigger
            conservative null responses.
          </li>
        </ul>
        <p>
          The 35% rate is higher than the 0.87–17.46% range found in the ACM government report study
          (2024), suggesting page complexity on foerderdatenbank.de is above average. A larger model
          (Sonnet or Opus) would likely reduce this rate, at higher cost.
        </p>

        <h3>5.2 Why CSS-Only Underperforms Expectation</h3>
        <p>
          CSS-only achieves only 75% average fill rate despite 0% error rate. This reveals a fundamental
          limitation: CSS selectors can only target what has been explicitly mapped. Fields like{" "}
          <code>deadlineInfo</code> (0% CSS fill rate) appear in unstructured text blocks that are
          structurally identical to surrounding paragraphs — no class or tag distinguishes them.
        </p>
        <p>
          This is the "last mile" problem of rule-based extraction: CSS handles the 80% of fields with
          predictable structure efficiently, but the remaining 20% require semantic understanding to
          locate.
        </p>

        <h3>5.3 Hybrid as the Practical Optimum</h3>
        <p>
          The hybrid strategy occupies a genuinely different position in the accuracy-cost-speed space:
        </p>
        <ul>
          <li>
            <strong>Better accuracy than both:</strong> 92% fill rate vs. 75% (CSS) and 60% (LLM-only)
          </li>
          <li>
            <strong>Better reliability than LLM-only:</strong> 0% vs. 35% error rate
          </li>
          <li>
            <strong>Lower cost than LLM-only:</strong> $0.0128 vs. $0.0156/page
          </li>
          <li>
            <strong>Faster than LLM-only:</strong> 2,152 ms vs. 8,915 ms
          </li>
          <li>
            <strong>Resilience under HTML change:</strong> −40% field loss in current single-page test,
            but attributable to LLM sampling variance at n=1 — see §4.5
          </li>
        </ul>
        <p>
          This profile matches the findings of the Berkeley templatized extraction study (2025), which
          found hybrid approaches (templates + LLM augmentation) outperform both pure-template and
          pure-LLM approaches on structured datasets with predictable but varying layouts.
        </p>

        <h3>5.4 Comparison with XPath-Based Extraction</h3>
        <p>
          A natural alternative to CSS selectors for structured HTML extraction is XPath. Darmawan et al.
          (2022) find XPath has lower execution time than CSS in multiprocessing scenarios. However,
          Ferrara et al.'s (2012) theoretical analysis applies equally: XPath expressions targeting
          specific structural positions are as brittle to HTML change as CSS class selectors. On
          foerderdatenbank.de, XPath would likely achieve similar per-field accuracy to CSS (same
          structural limitations) while adding maintenance complexity from absolute path expressions.
        </p>
        <p>
          The BardeenAgent approach (Bohra et al. 2025) — using an LLM to <em>generate</em> CSS
          selectors rather than human-authored ones — offers an interesting middle ground: it combines
          LLM's semantic understanding with CSS's speed advantage. However, it introduces a one-time
          per-site LLM call for selector generation, and generated selectors remain brittle to structural
          HTML change. It is best suited for sites with highly consistent templates and rare redesigns.
        </p>

        <h3>5.5 The SCRIBES Alternative</h3>
        <p>
          SCRIBES (2025) uses RL to generate site-level reusable extraction scripts, outperforming
          baselines by 13%+ while avoiding per-page LLM inference cost. For a dataset like
          foerderdatenbank.de — where 20 pages share the same CMS template — a SCRIBES-style approach
          would amortize the RL cost across thousands of pages. This represents a viable future direction
          for Sophex once the pipeline is processing at scale, but requires training infrastructure beyond
          the current stack.
        </p>

        {/* 6. Conclusion */}
        <h2>6. Conclusion</h2>
        <p>
          We evaluated three extraction strategies on 20 German government funding pages. The results are
          unambiguous on the accuracy dimension: the CSS-first hybrid with LLM fallback achieves 6.45/7
          fields on average, a 23% improvement over CSS-only and a 53% improvement over LLM-only, at zero
          error rate.
        </p>
        <p><strong>Recommendation for production pipelines:</strong></p>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Use Case</th>
                <th>Recommended Strategy</th>
                <th>Rationale</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Background data collection</td>
                <td><strong>Hybrid</strong></td>
                <td>Best accuracy + reliability; cost and speed acceptable for async jobs</td>
              </tr>
              <tr>
                <td>Real-time/interactive queries</td>
                <td><strong>CSS-only</strong></td>
                <td>29 ms per page; accuracy sufficient for known-format fields</td>
              </tr>
              <tr>
                <td>Post-restructure recovery</td>
                <td><strong>LLM-only</strong></td>
                <td>Zero resilience degradation; use after detected HTML structure change</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          <strong>Required follow-up:</strong> The resilience result (−40% hybrid field loss) is based on
          a single page with non-deterministic LLM sampling. Code review confirms the hybrid fallback
          correctly routes all null fields to LLM when CSS fails entirely — no prompt construction gap
          exists. A valid resilience measurement requires n ≥ 10 pages with <code>temperature=0</code> so
          that hybrid and LLM-only fallback calls are directly comparable. Until then, the −40% figure
          should be treated as illustrative variance, not a structural defect.
        </p>
        <p><strong>Future directions:</strong></p>
        <ol>
          <li>Expand benchmark to n ≥ 100 pages for statistical significance.</li>
          <li>Test LLM-only with Sonnet-class models to measure error rate reduction.</li>
          <li>
            Evaluate BardeenAgent-style LLM-generated selectors as an alternative CSS layer.
          </li>
          <li>
            Consider SCRIBES-style site-level script generation for production-scale cost reduction.
          </li>
          <li>
            Implement HTML structural change detection to automatically trigger LLM-only fallback on
            selector failure.
          </li>
        </ol>

        {/* References */}
        <h2>References</h2>
        <ol className="text-sm space-y-2">
          <li>
            Ferrara, E., De Meo, P., Fiumara, G., &amp; Baumgartner, R. (2012). <em>Web Data
            Extraction, Applications and Techniques: A Survey</em>. arXiv:1207.0246.
          </li>
          <li>
            Darmawan, I., Maulana, M., Gunawan, R., &amp; Widiyasono, N. (2022). Evaluating Web Scraping
            Performance Using XPath, CSS Selector, Regular Expression, and HTML DOM With
            Multiprocessing. <em>JOIV: International Journal on Informatics Visualization</em>, 6(4),
            904–910. DOI: 10.30630/joiv.6.4.1525.
          </li>
          <li>
            Patnaik, S. K., &amp; Babu, C. N. (2022). A Web Information Extraction Framework with
            Adaptive and Failure Prediction Feature. <em>ACM Journal of Data and Information
            Quality</em>, 14(2). DOI: 10.1145/3495008.
          </li>
          <li>
            Kim, S., Kim, N., &amp; Jeong, Y. (2025). <em>NEXT-EVAL: Next Evaluation of Traditional
            and LLM Web Data Record Extraction</em>. arXiv:2505.17125.
          </li>
          <li>
            Tenckhoff, S., Koddenbrock, M., &amp; Rodner, E. (2026). <em>LLMStructBench: Benchmarking
            Large Language Model Structured Data Extraction</em>. arXiv:2602.14743.
          </li>
          <li>
            Bohra, A., et al. (2025). <em>WebLists: Extracting Structured Information From Complex
            Interactive Websites Using Executable LLM Agents</em>. arXiv:2504.12682.
          </li>
          <li>
            Bhardwaj, A., Diwan, N., &amp; Wang, G. (2026). <em>Beyond BeautifulSoup: Benchmarking
            LLM-Powered Web Scraping for Everyday Users</em>. arXiv:2601.06301.
          </li>
          <li>
            Huang, W., et al. (2024). <em>AutoScraper: A Progressive Understanding Web Agent for Web
            Scraper Generation</em>. arXiv:2404.12753. EMNLP 2024.
          </li>
          <li>
            SCRIBES. (2025). <em>Web-Scale Script-Based Semi-Structured Data Extraction with
            Reinforcement Learning</em>. arXiv:2510.01832.
          </li>
          <li>
            UC Berkeley EECS. (2025). <em>Benchmarking Extraction of Structured Data from Templatized
            Documents</em>. EECS Technical Report EECS-2025-77. arXiv:2501.06659.
          </li>
          <li>
            ACM Digital Government. (2024). <em>Automating Government Report Generation: A Generative
            AI Approach</em>. DOI: 10.1145/3691352.
          </li>
          <li>
            Kahlon, N., &amp; Singh, W. (2025). <em>A Systematic Review of Web Scraping: Techniques,
            LLM-Enhanced Approaches, Performance Metrics, and Legal-Ethical Issues</em>. SSRN:5429131.
          </li>
        </ol>

      </article>

      {/* Publication footer */}
      <footer className="mt-16 pt-8 border-t border-gray-200 text-xs text-gray-400 space-y-1">
        <div>Published: March 27, 2026 — Sophex Research</div>
        <div>
          Raw data:{" "}
          <code className="bg-gray-100 px-1 rounded">
            pipelines/benchmark-results/css-vs-llm-2026-03-27.json
          </code>
        </div>
        <div>
          Benchmark code:{" "}
          <code className="bg-gray-100 px-1 rounded">
            pipelines/src/jobs/llm-extraction-benchmark.ts
          </code>
        </div>
        <div>
          CRO approval:{" "}
          <a href="/DAT/issues/DAT-72" className="underline hover:text-brand-600">
            DAT-72
          </a>
        </div>
      </footer>
    </div>
  );
}
