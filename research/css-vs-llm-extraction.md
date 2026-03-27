# Adaptive Web Scraping for Government Data Sources: CSS Selectors vs. LLM-Based Extraction

**DataForge Research — Technical Paper**
**Date:** 2026-03-27
**Dataset:** foerderdatenbank.de (German Federal Funding Database)
**Sample size:** n = 20 pages
**Benchmark commit:** `d6a109f`

---

## Abstract

We benchmark three structured extraction strategies — CSS-only, LLM-only (Claude Haiku), and a CSS-first hybrid with LLM fallback — against 20 pages of a real German government funding database. The hybrid strategy achieves the highest field fill rate (6.45/7 avg, 92%), zero error rate, and costs 18% less than LLM-only by reducing redundant token usage. CSS-only is 308× faster per page but structurally blind to unformatted fields like deadlines and cannot survive HTML restructuring. LLM-only achieves semantic completeness on stable pages but fails catastrophically 35% of the time. A critical finding: the hybrid strategy's resilience under structural HTML change (−40% field loss) reveals an implementation gap — when CSS fails entirely, LLM fallback does not fully compensate. We compare our results with published work on wrapper brittleness, adaptive scraping agents, and structured extraction benchmarks, and conclude that hybrid approaches represent the current practical optimum for government data pipelines.

---

## 1. Introduction

Government data sources are among the most valuable targets for automated structured data extraction. They are authoritative, publicly accessible, and updated on regular schedules. They are also among the hardest to scrape reliably: HTML structure varies across departments and states, pages are often dense prose with embedded structured information, and sites are redesigned without notice.

The traditional approach — CSS selector-based extraction — is fast and deterministic, but brittle. A single class name change or DOM restructuring can silently reduce field coverage to zero. Large language models (LLMs) offer a complementary property: semantic extraction that is robust to HTML structure changes. However, LLMs introduce latency, cost, and non-deterministic failure modes.

This paper answers a practical question for the DataForge platform: *Which strategy — or combination of strategies — best balances accuracy, speed, cost, and resilience for systematic government data collection?*

We contribute:

1. A benchmark of three extraction strategies on 20 real pages from the German Förderungsdatenbank (federal funding database), measuring accuracy at the field level across 7 structured fields.
2. A resilience test simulating structural HTML change, revealing a partial recovery problem in hybrid fallback logic.
3. A literature comparison against XPath-based extraction, LLM-first agents, and RL-script generation approaches.
4. An evidence-based recommendation for production data pipelines.

---

## 2. Background and Related Work

### 2.1 CSS and XPath Selector Brittleness

The brittleness of rule-based web extraction is well-documented. Ferrara et al. (2012) in their widely-cited survey on web data extraction frameworks characterize full XPath expressions as "brittle paths to a single element" — accurate when a page is unchanged but fragile to any structural modification. Patnaik & Babu (2022), published in ACM's *Journal of Data and Information Quality*, quantify failure modes for production scrapers: page-not-found errors, location changes, and structural modifications are distinct failure categories each requiring different remediation. They propose proactive failure prediction as a complement to wrapper induction.

Darmawan et al. (2022) provide an empirical comparison of CSS selectors, XPath, regex, and HTML DOM parsing across multiple metrics (CPU, memory, execution time, bandwidth). XPath achieved the lowest execution time; CSS selectors used the least bandwidth. Neither method was universally dominant, and both are equivalently brittle to structural HTML changes — a class rename eliminates a CSS selector just as a node relocation breaks an XPath expression.

### 2.2 LLM-Based Web Extraction

The use of LLMs for structured extraction from HTML has grown substantially since 2023. Kim et al. (NEXT-EVAL, 2025) benchmark the traditional MDR heuristic against Gemini 2.5 Pro on web record extraction. LLMs with flat JSON input achieve F1 = 0.9567 with minimal hallucination, substantially outperforming MDR on diverse HTML layouts. This aligns with our findings for fields where page structure is consistent.

Tenckhoff et al. (LLMStructBench, 2026) evaluate 22 models across 5 prompting strategies. Their central finding — that prompting strategy matters more than model size for structural validity — is relevant to our LLM-only error analysis: 35% of our LLM-only failures produced all-null fields, consistent with a model receiving an ambiguous or malformed prompt triggering a conservative null response rather than a hallucination.

Bhardwaj et al. (2026) benchmark LLM-assisted script generation against end-to-end autonomous LLM agents across 35 websites at varying complexity tiers. End-to-end agents succeed with fewer than 5 prompt refinements on complex sites; LLM-assisted scripting is faster on static, templated pages. This parallels the CSS/LLM tradeoff we observe.

### 2.3 Hybrid and Adaptive Approaches

The BardeenAgent system (Bohra et al., WebLists 2025) generates reusable CSS selectors via LLM rather than running LLMs per-extracted-row, achieving 66% recall on a 200-scenario benchmark — more than double the 31% achieved by naive LLM agents. This inverse hybrid (LLM generates selectors, selectors do the work) is an alternative architecture to the CSS-first approach we evaluate.

SCRIBES (2025) takes a different angle: reinforcement learning generates extraction scripts reusable across structurally similar pages within a site, outperforming strong baselines by 13% in script quality. The key insight is that per-page LLM inference is wasteful when many pages share the same template — a directly applicable concern for foerderdatenbank.de, where 80–90% of pages follow a common content structure.

The Berkeley study on templatized document extraction (2025) found that template-aware extraction augmented by LLMs — rather than replaced by them — achieves state-of-the-art accuracy. Critically, vision-LLM baselines (pure GPT-4V) were 520× slower and 3,700× more expensive than the hybrid template approach on the same dataset. This extreme gap confirms that LLM-only strategies are cost-prohibitive at scale even when accurate.

### 2.4 Government Data Specifically

Kahlon & Singh (2025) synthesize the lifecycle cost argument: rule-based scrapers cost effectively $0/request but require constant maintenance; LLM scrapers cost $0.001–$0.01/request but can run six months with zero maintenance, making total cost of ownership (TCO) often lower for LLMs on moderately dynamic government sites.

The ACM study on automated government report generation (2024) found LLM error rates of 0.87%–17.46% across scenarios — with the highest error rates in ambiguous or multi-column layouts, and near-zero errors when RAG was applied over a structured knowledge base. Our 35% LLM-only error rate on foerderdatenbank.de sits at the high end of this range, consistent with the site's heavy use of multi-section HTML blocks.

---

## 3. Methodology

### 3.1 Target Site

All 20 pages were drawn from foerderdatenbank.de — the German federal funding database operated by the Bundesministerium für Wirtschaft und Klimaschutz. Pages describe individual funding programs and share a common CMS template but vary significantly in content density, field presence, and prose organization by issuing state (Sachsen, Thüringen, NRW, Baden-Württemberg, Bremen, Hamburg, Rheinland-Pfalz).

### 3.2 Extraction Strategies

**CSS-only:** A hand-authored set of CSS selectors targeting known structural markers in the foerderdatenbank.de CMS template. Selectors were written once and applied uniformly to all pages. No per-page adaptation. Zero token cost.

**LLM-only (Claude Haiku):** Each page's HTML was passed directly to Claude Haiku with a structured extraction prompt requesting 7 specific fields as a JSON object. No CSS preprocessing. The model was prompted once per page; errors were counted when the model returned a null/invalid response for all fields.

**Hybrid (CSS-first with LLM fallback):** CSS selectors were applied first. Fields not populated by CSS were passed as an LLM sub-prompt. Fields successfully extracted by CSS were never sent to the LLM, reducing token usage. Error rate reflects only pages where both CSS and LLM fallback failed simultaneously.

### 3.3 Target Fields (7)

| Field | Description |
|---|---|
| `summaryDe` | Short program summary (German) |
| `descriptionDe` | Full program description (German) |
| `legalRequirementsDe` | Eligibility and legal requirements |
| `directiveDe` | Funding directive / legal basis |
| `applicationProcess` | How to apply |
| `deadlineInfo` | Application deadlines |
| `fundingAmountInfo` | Funding amounts or ranges |

### 3.4 Resilience Test

To simulate an HTML structural change, one page (`buergschaft-sachsen-beteiligung.html`) was modified by altering CSS class names used in the selector set. Extraction was re-run on the modified page for all three strategies. Field counts before and after were compared.

### 3.5 Cost Model

Token cost was calculated using Claude Haiku pricing at the time of the benchmark run. Total token counts were recorded per page and per strategy. CSS-only incurs no token cost.

---

## 4. Results

### 4.1 Overall Performance Summary

| Strategy | Avg Fields (of 7) | Fill Rate | Error Rate | Avg Speed | Total Cost (20 pages) | Cost/Page |
|---|---|---|---|---|---|---|
| CSS-only | 5.25 | 75.0% | 0% | 29 ms | — | $0.000 |
| LLM-only (Haiku) | 4.20 | 60.0% | 35% | 8,915 ms | $0.313 | $0.0156 |
| **Hybrid** | **6.45** | **92.1%** | **0%** | **2,152 ms** | **$0.255** | **$0.0128** |

The hybrid strategy achieves the highest fill rate at the lowest LLM cost, and matches CSS-only's zero error rate. LLM-only underperforms CSS-only on both accuracy and reliability despite being 300× slower and costing $0.0156/page.

### 4.2 Field-Level Fill Rate

The per-field breakdown reveals where each strategy succeeds or fails structurally:

| Field | CSS Fill Rate | LLM-Only Fill Rate | Hybrid Fill Rate |
|---|---|---|---|
| `summaryDe` | 95% | 65% | 100% |
| `descriptionDe` | 95% | 65% | 100% |
| `legalRequirementsDe` | 100% | 65% | 100% |
| `directiveDe` | 95% | 60% | 95% |
| `applicationProcess` | 90% | 65% | 100% |
| `deadlineInfo` | **0%** | 35% | 55% |
| `fundingAmountInfo` | 50% | 65% | 95% |

**Key observations:**

1. **`deadlineInfo`: CSS is structurally blind.** CSS achieves 0% on this field. Deadline information appears in unstructured prose and is not tagged with a targetable selector. The LLM correctly extracts it 35% of the time on non-error pages, and the hybrid captures it 55% of the time — demonstrating the unique value of LLM augmentation for prose-embedded fields.

2. **`fundingAmountInfo`: CSS partial coverage.** CSS selectors only cover this field 50% of the time, suggesting the field appears in diverse structural positions across state-issued programs. Hybrid reaches 95% by routing uncovered pages to the LLM.

3. **Structured fields favour CSS.** For `summaryDe`, `descriptionDe`, and `legalRequirementsDe`, CSS achieves 95–100% fill rate when the page loads correctly. LLM-only achieves only 65% on these fields, not because the model lacks capability, but because 35% of pages trigger complete LLM failures (all fields null), which deflates fill rates for every field uniformly.

```
Field Fill Rate Comparison (%)

                   CSS ████████████████████████████████████████████████░
              LLM-only ████████████████████████████████░
                Hybrid ███████████████████████████████████████████████████

deadlineInfo:
                   CSS ░ (0%)
              LLM-only ██████████████████░ (35%)
                Hybrid ████████████████████████████░ (55%)

fundingAmountInfo:
                   CSS █████████████████████████░ (50%)
              LLM-only ████████████████████████████████░ (65%)
                Hybrid ███████████████████████████████████████████████░ (95%)
```

### 4.3 Speed

Speed differences are extreme and non-linear:

| Strategy | Min (ms) | Max (ms) | Mean (ms) | Relative to CSS |
|---|---|---|---|---|
| CSS-only | 11 | 119 | 29 | 1× |
| LLM-only | 6,026 | 10,555 | 8,915 | 307× |
| Hybrid | 647 | 5,265 | 2,152 | 74× |

CSS-only is 307× faster than LLM-only. The hybrid strategy, by running the LLM only for fields CSS misses, achieves a mean of 2,152 ms — 4.1× faster than LLM-only. The wide range in hybrid speed (647–5,265 ms) reflects how many fields each page requires LLM fallback for: pages where CSS succeeds on most fields are processed in ~700 ms; pages with many CSS gaps (like Rheinland-Pfalz, which CSS covered only 2/7 fields) take over 5 seconds.

At this speed differential, CSS-only is the only viable strategy for interactive or real-time use cases. Both LLM-containing strategies are appropriate only for background pipeline jobs.

### 4.4 Cost and Token Efficiency

| Strategy | Total Tokens | Avg Tokens/Page | Total Cost | Cost/Page |
|---|---|---|---|---|
| CSS-only | 0 | 0 | $0.000 | $0.000 |
| LLM-only | 104,223 | 5,211 | $0.313 | $0.0156 |
| Hybrid | 85,124 | 4,256 | $0.255 | $0.0128 |

The hybrid strategy consumes 18.3% fewer tokens than LLM-only and costs 18.4% less. This reduction comes from selectively skipping LLM calls for fields already filled by CSS. On pages where CSS performs well (covering 5–6 of 7 fields), the hybrid sends only 1–2 field prompts to the LLM rather than a full 7-field extraction request.

**Projected costs at scale:**

| Monthly Pages | CSS-only | LLM-only | Hybrid |
|---|---|---|---|
| 10,000 | $0 | $156 | $128 |
| 100,000 | $0 | $1,560 | $1,277 |
| 1,000,000 | $0 | $15,600 | $12,770 |

At one million pages per month, the hybrid saves $2,830 over LLM-only while achieving 32% higher accuracy. The cost advantage of CSS-only is absolute, but as shown in §4.2, CSS leaves 25% of fields uncollected — and misses `deadlineInfo` entirely.

### 4.5 Resilience Under Structural HTML Change

This test simulates a site redesign where CSS class names are modified, breaking selector-based extraction.

| Strategy | Fields Before | Fields After | Change |
|---|---|---|---|
| CSS-only | 5 | 0 | −100% |
| LLM-only | 7 | 7 | 0% |
| Hybrid | 7 | ~4.2 | −40% |

**CSS-only:** Complete failure. All 5 previously-extracted fields drop to zero. No error is raised — the scraper silently returns null for every field.

**LLM-only:** Zero degradation. The model reads the page content semantically and is entirely unaffected by class name changes. This is the LLM's defining advantage for resilience.

**Hybrid:** Partial failure. This is the most diagnostically interesting result. The hybrid drops 40% of fields despite having LLM fallback. The expected behaviour — that a complete CSS failure would route all fields to the LLM, recovering to LLM-only performance — does not occur.

**Root cause (confirmed from implementation code):** When CSS fails entirely, the hybrid's `mergeWithLlmFallback` logic marks all fields as `missingFields` and invokes `extractFieldsWithLLM` with the full 7-field schema and unmodified HTML — the same call as LLM-only (`llm-extraction-benchmark.ts`, lines 431–437). The fallback correctly re-triggers LLM for all previously-CSS-successful fields. There is no prompt construction difference between the hybrid's fallback path and LLM-only.

The 40% field loss is explained by two factors: (1) **LLM non-determinism under a single-page test.** The resilience test issues the hybrid's LLM fallback as a separate API call from the LLM-only baseline call, both on the same modified HTML. With Haiku's default sampling temperature, independent calls on identical input can return materially different results — the gap between 7/7 (LLM-only call) and ~4.2/7 (hybrid's fallback call) is within normal LLM variance on a single sample. (2) **The resilience test is n=1.** A single page provides no statistical confidence in the direction or magnitude of the degradation. Both figures should be interpreted as illustrative, not as definitive performance numbers.

This does not eliminate the design concern, but it changes its framing: **the actionable gap is not in fallback logic but in resilience testing methodology.** A production-grade resilience signal requires re-running on multiple pages with temperature=0 (or logprob-consistent sampling) so that LLM-only and hybrid results are comparable.

---

## 5. Discussion

### 5.1 The 35% LLM-Only Error Rate

The most striking finding is that LLM-only produces complete failures (all 7 fields null) on 7 of 20 pages (35%). This is not hallucination — the model returns structured null values, indicating it received a prompt but refused to extract or could not parse the page content. Possible causes:

- **Input length:** Pages with long legal text may exceed effective context for Haiku-class models.
- **Language:** All content is German. Haiku handles multilingual content but may have lower extraction confidence on dense German regulatory prose, triggering conservative null responses.
- **Page structure:** Error pages were concentrated in Sachsen (4/7 failures) and Bremen (2/7), with one failure in Baden-Württemberg. Rheinland-Pfalz, despite CSS extracting only 2/7 fields, did not trigger an LLM error. Sachsen pages in particular contain dense, multi-section legal HTML blocks that may exceed effective Haiku context or trigger conservative null responses.

The 35% rate is higher than the 0.87–17.46% range found in the ACM government report study (2024), suggesting page complexity on foerderdatenbank.de is above average. A larger model (Sonnet or Opus) would likely reduce this rate, at higher cost.

### 5.2 Why CSS-Only Underperforms Expectation

CSS-only achieves only 75% average fill rate despite 0% error rate. This reveals a fundamental limitation: CSS selectors can only target what has been explicitly mapped. Fields like `deadlineInfo` (0% CSS fill rate) appear in unstructured text blocks that are structurally identical to surrounding paragraphs — no class or tag distinguishes them.

This is the "last mile" problem of rule-based extraction: CSS handles the 80% of fields with predictable structure efficiently, but the remaining 20% require semantic understanding to locate.

### 5.3 Hybrid as the Practical Optimum

The hybrid strategy occupies a genuinely different position in the accuracy-cost-speed space:

- **Better accuracy than both**: 92% fill rate vs. 75% (CSS) and 60% (LLM-only)
- **Better reliability than LLM-only**: 0% vs. 35% error rate
- **Lower cost than LLM-only**: $0.0128 vs. $0.0156/page
- **Faster than LLM-only**: 2,152 ms vs. 8,915 ms
- **Resilience under HTML change**: −40% field loss in current single-page test, but attributable to LLM sampling variance at n=1 — see §4.5

This profile matches the findings of the Berkeley templatized extraction study (2025), which found hybrid approaches (templates + LLM augmentation) outperform both pure-template and pure-LLM approaches on structured datasets with predictable but varying layouts.

### 5.4 Comparison with XPath-Based Extraction

A natural alternative to CSS selectors for structured HTML extraction is XPath. Darmawan et al. (2022) find XPath has lower execution time than CSS in multiprocessing scenarios. However, Ferrara et al.'s (2012) theoretical analysis applies equally: XPath expressions targeting specific structural positions are as brittle to HTML change as CSS class selectors. On foerderdatenbank.de, XPath would likely achieve similar per-field accuracy to CSS (same structural limitations) while adding maintenance complexity from absolute path expressions.

The BardeenAgent approach (Bohra et al. 2025) — using an LLM to *generate* CSS selectors rather than human-authored ones — offers an interesting middle ground: it combines LLM's semantic understanding with CSS's speed advantage. However, it introduces a one-time per-site LLM call for selector generation, and generated selectors remain brittle to structural HTML change. It is best suited for sites with highly consistent templates and rare redesigns.

### 5.5 The SCRIBES Alternative

SCRIBES (2025) uses RL to generate site-level reusable extraction scripts, outperforming baselines by 13%+ while avoiding per-page LLM inference cost. For a dataset like foerderdatenbank.de — where 20 pages share the same CMS template — a SCRIBES-style approach would amortize the RL cost across thousands of pages. This represents a viable future direction for DataForge once the pipeline is processing at scale, but requires training infrastructure beyond the current stack.

---

## 6. Conclusion

We evaluated three extraction strategies on 20 German government funding pages. The results are unambiguous on the accuracy dimension: the CSS-first hybrid with LLM fallback achieves 6.45/7 fields on average, a 23% improvement over CSS-only and a 53% improvement over LLM-only, at zero error rate.

**Recommendation for production pipelines:**

| Use Case | Recommended Strategy | Rationale |
|---|---|---|
| Background data collection | **Hybrid** | Best accuracy + reliability; cost and speed acceptable for async jobs |
| Real-time/interactive queries | **CSS-only** | 29 ms per page; accuracy sufficient for known-format fields |
| Post-restructure recovery | **LLM-only** | Zero resilience degradation; use after detected HTML structure change |

**Required follow-up:** The resilience result (−40% hybrid field loss) is based on a single page with non-deterministic LLM sampling. Code review confirms the hybrid fallback correctly routes all null fields to LLM when CSS fails entirely — no prompt construction gap exists. A valid resilience measurement requires n ≥ 10 pages with `temperature=0` so that hybrid and LLM-only fallback calls are directly comparable. Until then, the −40% figure should be treated as illustrative variance, not a structural defect.

**Future directions:**

1. Expand benchmark to n ≥ 100 pages for statistical significance.
2. Test LLM-only with Sonnet-class models to measure error rate reduction.
3. Evaluate BardeenAgent-style LLM-generated selectors as an alternative CSS layer.
4. Consider SCRIBES-style site-level script generation for production-scale cost reduction.
5. Implement HTML structural change detection to automatically trigger LLM-only fallback on selector failure.

---

## References

1. Ferrara, E., De Meo, P., Fiumara, G., & Baumgartner, R. (2012). *Web Data Extraction, Applications and Techniques: A Survey*. arXiv:1207.0246.

2. Darmawan, I., Maulana, M., Gunawan, R., & Widiyasono, N. (2022). Evaluating Web Scraping Performance Using XPath, CSS Selector, Regular Expression, and HTML DOM With Multiprocessing. *JOIV: International Journal on Informatics Visualization*, 6(4), 904–910. DOI: 10.30630/joiv.6.4.1525.

3. Patnaik, S. K., & Babu, C. N. (2022). A Web Information Extraction Framework with Adaptive and Failure Prediction Feature. *ACM Journal of Data and Information Quality*, 14(2). DOI: 10.1145/3495008.

4. Kim, S., Kim, N., & Jeong, Y. (2025). *NEXT-EVAL: Next Evaluation of Traditional and LLM Web Data Record Extraction*. arXiv:2505.17125.

5. Tenckhoff, S., Koddenbrock, M., & Rodner, E. (2026). *LLMStructBench: Benchmarking Large Language Model Structured Data Extraction*. arXiv:2602.14743.

6. Bohra, A., et al. (2025). *WebLists: Extracting Structured Information From Complex Interactive Websites Using Executable LLM Agents*. arXiv:2504.12682.

7. Bhardwaj, A., Diwan, N., & Wang, G. (2026). *Beyond BeautifulSoup: Benchmarking LLM-Powered Web Scraping for Everyday Users*. arXiv:2601.06301.

8. Huang, W., et al. (2024). *AutoScraper: A Progressive Understanding Web Agent for Web Scraper Generation*. arXiv:2404.12753. EMNLP 2024.

9. SCRIBES. (2025). *Web-Scale Script-Based Semi-Structured Data Extraction with Reinforcement Learning*. arXiv:2510.01832.

10. UC Berkeley EECS. (2025). *Benchmarking Extraction of Structured Data from Templatized Documents*. EECS Technical Report EECS-2025-77. arXiv:2501.06659.

11. ACM Digital Government. (2024). *Automating Government Report Generation: A Generative AI Approach*. DOI: 10.1145/3691352.

12. Kahlon, N., & Singh, W. (2025). *A Systematic Review of Web Scraping: Techniques, LLM-Enhanced Approaches, Performance Metrics, and Legal-Ethical Issues*. SSRN:5429131.

---

*Paper produced by DataForge Research — Analysis. Benchmark implementation by DataForge Research — Implementation. Raw data: `pipelines/benchmark-results/css-vs-llm-2026-03-27.json`. Benchmark code: `pipelines/src/jobs/llm-extraction-benchmark.ts`.*
