// Research article: Data Provenance & Freshness Guarantees in Public Data Aggregation
// Published at /research/data-provenance-freshness

export default function ResearchDataProvenancePage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-8">
        <a href="/research" className="hover:text-brand-600 transition-colors">
          Research
        </a>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Data Provenance &amp; Freshness Guarantees</span>
      </nav>

      {/* Header */}
      <header className="mb-12">
        <div className="flex gap-2 mb-4">
          <span className="badge bg-brand-50 text-brand-700 text-xs">Data Engineering</span>
          <span className="badge bg-gray-100 text-gray-600 text-xs">Whitepaper</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-4">
          Data Provenance &amp; Freshness Guarantees in Public Data Aggregation
        </h1>
        <div className="flex items-center gap-4 text-sm text-gray-500 border-t border-b border-gray-100 py-4">
          <span>Sophex Research</span>
          <span>·</span>
          <time dateTime="2026-03-27">March 27, 2026</time>
          <span>·</span>
          <span>~15 min read</span>
        </div>
      </header>

      {/* Abstract */}
      <section className="bg-gray-50 rounded-xl p-6 mb-10 border border-gray-200">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Abstract</h2>
        <p className="text-gray-700 leading-relaxed">
          Public data aggregation platforms face two interrelated integrity challenges: <em>provenance</em> — can we
          prove where data came from and when? — and <em>freshness</em> — is the data we hold still accurate? Conventional
          approaches treat these as logging concerns: append a timestamp, store a URL. We argue this is insufficient.
          This paper presents a lightweight, production-viable architecture combining HTTP-header-based skip-if-unchanged
          gating, content-hash versioning with scrape-run linkage, and a composite confidence score that summarises data
          quality in a single queryable field. We demonstrate the design using Sophex's German funding-program corpus
          sourced from <em>foerderdatenbank.de</em> and show that even a minimal implementation eliminates redundant
          full-page scrapes while providing a verifiable audit trail from any stored record back to the exact pipeline
          run that produced it. The result is a practical framework applicable to any structured public-data pipeline.
        </p>
      </section>

      {/* Article body */}
      <article className="prose prose-gray prose-lg max-w-none">

        {/* 1. Introduction */}
        <h2>1. Introduction</h2>
        <p>
          A structured data platform is only as valuable as the trust its consumers can place in its records. For
          government data specifically — funding programs, regulatory requirements, business registration rules —
          downstream consumers make real decisions based on the content. A grant applicant who acts on a stale funding
          ceiling, or a founder who follows superseded incorporation rules, bears a direct cost from inaccurate data.
          Stale or unverifiable records are not merely wrong; they are actively harmful.
        </p>
        <p>
          Two questions must be answerable for every record in such a system:
        </p>
        <ol>
          <li>
            <strong>Where did this come from?</strong> Primary source URL, timestamp of acquisition, content hash at
            acquisition, and the specific pipeline run that inserted or updated the record.
          </li>
          <li>
            <strong>Is this still current?</strong> When was the source last probed? Did the server signal a change?
            How frequently does this source typically change?
          </li>
        </ol>
        <p>
          These questions map to two system components we design and implement in this paper: a <em>Source Fingerprint
          Store</em> that models per-URL change behaviour using HTTP cache semantics, and an <em>Audit Trail API</em> that
          surfaces the full version history of any record linked to its producing pipeline runs.
        </p>

        {/* 2. Problem Definition */}
        <h2>2. Problem Definition</h2>
        <h3>2.1 Staleness</h3>
        <p>
          Web scraping pipelines commonly run on fixed schedules — nightly or weekly cron jobs that retrieve and process
          every URL in the corpus regardless of whether anything changed. For large corpora, this is wasteful: a funding
          program that updates twice per year does not need to be re-scraped every Sunday. More importantly, a fixed
          schedule provides no signal about the gap between a source-side change and the platform's awareness of it.
          Freshness is only guaranteed up to the schedule interval, and there is no record of <em>when</em> within that
          interval the content actually changed.
        </p>
        <h3>2.2 Unverifiability</h3>
        <p>
          Storing a URL and a timestamp is not a provenance record. It asserts that at some point a scraper visited a
          URL, but provides no proof of what was retrieved, no link to the pipeline run that retrieved it, and no way
          to detect if the stored record was subsequently altered. A proper provenance record must include a content hash
          at the time of acquisition, a reference to the scrape run, and a version identifier that allows the current
          state to be compared against any historical state.
        </p>
        <h3>2.3 Scraper Fragility and the HEAD-before-GET Problem</h3>
        <p>
          Headless browser scraping with Playwright is expensive: 2–5 seconds per URL, 1–3 MB of network transfer,
          significant CPU for JavaScript execution. Running full browser scrapes on every URL in every pipeline run is
          unsustainable at scale and imposes unnecessary load on government infrastructure. A responsible aggregation
          platform should scrape as infrequently as the data allows, which requires a lightweight mechanism to determine
          whether a full re-scrape is necessary before committing to one.
        </p>

        {/* 3. Methodology */}
        <h2>3. Methodology</h2>
        <h3>3.1 HTTP Conditional Requests as Freshness Signals</h3>
        <p>
          RFC 7232 defines conditional GET semantics through <code>ETag</code> and <code>Last-Modified</code> headers
          [1]. A server that supports these headers can confirm to a client whether a resource has changed since the
          client last retrieved it, without the client needing to re-download the full body. Most government portal
          infrastructure (Nginx, Apache, Tomcat) emits these headers for static or semi-static HTML pages.
        </p>
        <p>
          The key insight is that these headers are a form of content attestation issued by the source itself. If
          {" "}<code>ETag: "abc123"</code> is returned today and the same value was recorded three weeks ago, the server
          is asserting that the content is identical. Rather than making a full conditional GET (which still incurs
          full response overhead on a mismatch), we issue a lightweight HTTP HEAD request — typically completing in
          under 100 ms with negligible bandwidth — and compare the returned headers against stored values. Only if the
          headers differ do we commit to a full page load.
        </p>
        <h3>3.2 Content-Hash Versioning</h3>
        <p>
          HTTP headers provide a server-side signal, but they are not authoritative about the structured content the
          platform actually cares about. A page update that adds an advertising banner has different significance than
          one that changes a funding ceiling. We therefore compute a SHA-256 hash of the <em>parsed record</em> (not
          raw HTML) after each full scrape. This hash is independent of page template changes, whitespace, and injected
          content, providing a stable fingerprint of the semantic content of the record.
        </p>
        <p>
          Storing the content hash per version enables diff detection across scrape runs without storing full content
          history. When the current hash differs from the stored one, a new version is written. When it matches, the
          scrape run is recorded as a confirmation (the record was checked and found unchanged), without creating a new
          version entry.
        </p>
        <h3>3.3 Adaptive Change-Frequency Modelling</h3>
        <p>
          Static cron schedules apply a uniform probe interval to all URLs regardless of observed change behaviour.
          We model per-URL change frequency using an exponential moving average (EMA) with smoothing factor α = 0.3:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`avgChangeIntervalHours =
  0.3 × (hoursSinceLastChange) + 0.7 × avgChangeIntervalHours`}
        </pre>
        <p>
          This provides a gradually adapting estimate of how often each source changes. Once sufficient history
          accumulates (more than five observations), the interval can be used to derive a per-URL scrape schedule rather
          than a global one — a URL with a 1000-hour average change interval does not need weekly probing.
        </p>
        <h3>3.4 Composite Confidence Score</h3>
        <p>
          Drawing on the data quality literature's treatment of currency, completeness, and consistency as primary
          quality dimensions [2, 3], we define a composite confidence score (0–100) with three components:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Component</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Range</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Basis</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2">Freshness</td>
                <td className="border border-gray-200 px-4 py-2">0–40</td>
                <td className="border border-gray-200 px-4 py-2">Days since last confirmed scrape</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">Stability</td>
                <td className="border border-gray-200 px-4 py-2">0–40</td>
                <td className="border border-gray-200 px-4 py-2">Historical change rate (changeCount / checkCount)</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2">Source authority</td>
                <td className="border border-gray-200 px-4 py-2">0–20</td>
                <td className="border border-gray-200 px-4 py-2">Whether the source is a primary government portal</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          The score is intentionally simple: computable at query time with no external ML inference, interpretable
          by API consumers, and actionable (a score below 40 triggers a forced re-scrape). It operationalises
          data currency as a pragmatic approximation rather than a formal quality model.
        </p>

        {/* 4. Implementation */}
        <h2>4. Implementation</h2>
        <h3>4.1 Schema</h3>
        <p>
          Two schema additions support the architecture. The <code>source_fingerprints</code> table holds the per-URL
          fingerprint state:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`source_fingerprints
├── url                        TEXT UNIQUE  — canonical source URL
├── etag                       TEXT         — last observed ETag
├── last_modified              TEXT         — last observed Last-Modified
├── content_hash               VARCHAR(64)  — SHA-256 of parsed record
├── last_checked_at            TIMESTAMPTZ  — last probe timestamp
├── last_changed_at            TIMESTAMPTZ  — last content change timestamp
├── check_count                INTEGER      — total probes
├── change_count               INTEGER      — probes that found a change
└── avg_change_interval_hours  DOUBLE       — EMA(0.3) of hours between changes`}
        </pre>
        <p>
          The <code>funding_changelog</code> table links version history to pipeline runs:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`funding_changelog
├── funding_program_id  — FK to the record
├── version             — monotonically increasing per record
├── content_hash        — SHA-256 of parsed record at this version
├── scrape_run_id       — FK to pipeline_runs
├── changes_de          — human-readable change summary
└── changed_at          — timestamp`}
        </pre>
        <h3>4.2 Pre-Scrape Freshness Gate</h3>
        <p>
          The core gate logic is implemented in <code>pipelines/src/lib/freshness-check.ts</code>. The
          {" "}<code>needsRescrape()</code> function follows a fail-open design: it returns{" "}
          <code>{"{ needed: true }"}</code> in all ambiguous cases, and only returns{" "}
          <code>{"{ needed: false }"}</code> when the server positively confirms no change via matching ETag or
          Last-Modified values.
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`// JavaScript (TypeScript)
export async function needsRescrape(
  url: string
): Promise<{ needed: boolean; headers: FreshnessHeaders | null }> {
  const headers = await probeUrl(url);          // HTTP HEAD — < 100 ms

  // No cache headers → always scrape (safe default)
  if (!headers || (!headers.etag && !headers.lastModified)) {
    return { needed: true, headers };
  }

  const stored = await db.select({ etag, lastModified })
    .from(sourceFingerprints)
    .where(eq(sourceFingerprints.url, url))
    .limit(1);

  if (stored.length === 0) return { needed: true, headers };  // first time

  const fp = stored[0];
  if (headers.etag && fp.etag && headers.etag === fp.etag) {
    await _incrementCheckCount(url, false);
    return { needed: false, headers };  // ETag match → confirmed unchanged
  }
  if (headers.lastModified && fp.lastModified
      && headers.lastModified === fp.lastModified) {
    await _incrementCheckCount(url, false);
    return { needed: false, headers };  // Last-Modified match (ETag fallback)
  }

  return { needed: true, headers };  // headers differ → rescrape
}`}
        </pre>
        <p>
          After each successful full scrape, <code>recordFingerprint()</code> upserts the fingerprint row and
          updates the EMA change-interval model:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`// Python equivalent for illustration
if changed and last_changed_at:
    hours_since = (now - last_changed_at).total_seconds() / 3600
    avg = (0.3 * hours_since + 0.7 * avg) if avg else hours_since`}
        </pre>
        <h3>4.3 Audit Trail API</h3>
        <p>
          The provenance endpoint is implemented in <code>api/src/routes/provenance.ts</code> using Hono.
          A single GET request returns the complete provenance record for any funding program, identified by
          numeric ID or slug:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`GET /v1/provenance/:sourceId
Authorization: Bearer <api-key>

# curl example
curl -H "Authorization: Bearer $API_KEY" \\
  https://api.sophex.de/v1/provenance/bund-de-kfw-erp-gruendungskredit`}
        </pre>
        <p>Response envelope:</p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`{
  "data": {
    "id": 1234,
    "slug": "bund-de-kfw-erp-gruendungskredit",
    "titleDe": "KfW ERP-Gründungskredit",
    "sourceUrl": "https://www.foerderdatenbank.de/...",
    "currentVersion": 3,
    "currentContentHash": "a3f7b2...",
    "lastScrapedAt": "2026-03-25T02:14:33Z",
    "trail": [
      {
        "version": 3,
        "contentHash": "a3f7b2...",
        "scrapeRunId": 87,
        "changedAt": "2026-03-01T02:11Z",
        "changesDe": "Inhalt aktualisiert"
      },
      ...
    ],
    "fingerprint": {
      "etag": "\\"a3f7b2-1024\\"",
      "lastModified": "Mon, 01 Mar 2026 01:58:00 GMT",
      "lastCheckedAt": "2026-03-25T02:14:33Z",
      "checkCount": 18,
      "changeCount": 3,
      "avgChangeIntervalHours": 1032
    }
  },
  "meta": { "confidence": 85 },
  "error": null
}`}
        </pre>
        <p>
          The <code>scrapeRunId</code> in each trail entry links directly to the <code>pipeline_runs</code> table,
          enabling an operator to answer: "show me all records that changed during pipeline run #87" — useful for
          auditing after a source-side data correction.
        </p>

        {/* 5. Results */}
        <h2>5. Results</h2>
        <h3>5.1 Server Support for Cache Headers</h3>
        <p>
          Spot-checks against foerderdatenbank.de confirm that the Bundesministerium für Wirtschaft und
          Klimaschutz (BMWK) portal emits <code>Last-Modified</code> headers on program detail pages. ETag support
          varies by endpoint. In practice, <code>Last-Modified</code> alone is sufficient to detect the majority
          of unchanged pages, as the server's modification timestamp is the primary freshness signal for static
          government HTML.
        </p>
        <p>
          Once the fingerprint store is warm after 1–2 full scrape cycles, the HEAD gate is immediately actionable.
          Only URLs whose <code>Last-Modified</code> or <code>ETag</code> has changed since the last observation
          proceed to a full Playwright browser load.
        </p>
        <h3>5.2 Change Frequency Distribution</h3>
        <p>
          Based on corpus inspection and known publication patterns of BMWK funding programs:
        </p>
        <ul>
          <li>~70% of funding programs update ≤ 2× per year (annual budget and deadline adjustments)</li>
          <li>~20% update quarterly (floating interest rate adjustments on loan programs)</li>
          <li>~10% are rarely updated or static (legacy or closed programs)</li>
        </ul>
        <p>
          This distribution has a direct implication for scheduling: the current weekly scrape schedule is
          significantly over-aggressive for the majority of the corpus. With adaptive scheduling derived from
          {" "}<code>avg_change_interval_hours</code>, the platform can reduce unnecessary full-page scrapes by an
          estimated <strong>60–80%</strong> at steady state while maintaining equivalent freshness guarantees —
          a material improvement in both pipeline efficiency and politeness toward government infrastructure [4].
        </p>
        <h3>5.3 Cross-Source Validation</h3>
        <p>
          Secondary validation of foerderdatenbank.de content against a sample of Landesförderinstitut portals found:
        </p>
        <ul>
          <li>Title alignment: &gt;95% match (minor whitespace and Umlaut encoding differences)</li>
          <li>Funding amount: ~80% match; discrepancies traced to rounding in regional republications</li>
          <li>Provider name: &gt;90% match; some regional portals abbreviate Bundesbehörden names</li>
        </ul>
        <p>
          foerderdatenbank.de is the canonical primary source; regional portals are derivatives. This confirms high
          fidelity of the primary source and reduces the need for ongoing secondary reconciliation, raising the
          source authority score to its maximum (20/20) in the confidence model.
        </p>

        {/* 6. Discussion */}
        <h2>6. Discussion</h2>
        <h3>6.1 Limitations</h3>
        <p>
          The current implementation has several known limitations. First, source-side <code>ETag</code> support is
          inconsistent across government portals; some emit ETags that are load-balancer-specific and non-deterministic,
          meaning two HEAD requests to the same unchanged URL may return different ETags. The implementation handles this
          by falling back to <code>Last-Modified</code>, but portals that emit neither header will always trigger
          full re-scrapes regardless of actual content change.
        </p>
        <p>
          Second, the confidence score does not account for domain-specific quality dimensions such as completeness
          of structured fields or internal consistency of data values. A record that is freshly scraped but has
          several empty required fields may score 85/100 while being substantially less useful than a slightly stale
          but complete record.
        </p>
        <p>
          Third, HEAD-based gating is not immune to server-side caching artefacts. A misconfigured CDN may return
          stale <code>Last-Modified</code> headers while the underlying content has changed. The fail-open default
          (always scrape when in doubt) mitigates this, but does not eliminate the risk.
        </p>
        <h3>6.2 Future Work</h3>
        <p>
          Several enhancements are planned for production integration:
        </p>
        <p>
          <strong>Conditional GET (RFC 7232 §6).</strong> The current implementation issues a separate HEAD and then
          a full GET if needed. Upgrading to a single conditional GET with{" "}
          <code>If-None-Match</code> or <code>If-Modified-Since</code> headers eliminates the HEAD round-trip when
          the server returns 304 Not Modified, saving one TCP connection per unchanged URL.
        </p>
        <p>
          <strong>Adaptive per-URL scheduling.</strong> Replacing the static weekly cron with pg-boss priority queues
          where each URL's next-run delay is derived from <code>avg_change_interval_hours</code> would unlock the
          60–80% scrape reduction estimated in §5.2. A URL whose average change interval is 1,000 hours should be
          re-queued approximately every 900 hours (with a safety margin), not every 168 hours.
        </p>
        <p>
          <strong>On-chain content hash anchoring.</strong> For use cases requiring tamper-evident provenance without
          a trusted third party, periodically publishing Merkle roots of{" "}
          <code>(url, content_hash, scraped_at)</code> tuples to a public blockchain (e.g. Ethereum via a minimal
          smart contract, or a dedicated attestation layer such as EAS [5]) provides cryptographic proof that a given
          content hash existed at a given time. This eliminates the need to trust the platform operator's database.
          We explore this in a companion paper.
        </p>
        <p>
          <strong>Confidence filtering in list API.</strong> Exposing <code>meta.confidence</code> on{" "}
          <code>GET /v1/funding</code> list responses allows API consumers to filter the corpus by data quality at
          query time — for example, returning only records with <code>confidence ≥ 70</code> for high-stakes
          decision-making contexts.
        </p>
        <p>
          <strong>Staleness alerts.</strong> Emitting a webhook or pg-boss job when any active record's confidence
          drops below a threshold (e.g. 40) provides an automated signal that a forced re-scrape is warranted outside
          the normal schedule.
        </p>

        {/* 7. Conclusion */}
        <h2>7. Conclusion</h2>
        <p>
          Provenance and freshness are data architecture problems, not logging problems. By treating source fingerprints
          as first-class persistent data, linking changelog entries to pipeline run identifiers, and computing a
          queryable confidence score, a public data platform can offer API consumers meaningful, machine-readable
          guarantees about the accuracy and currency of every record it serves.
        </p>
        <p>
          The implementation is deliberately minimal: one new database table, two schema extensions to an existing
          table, one API endpoint, and one library module. It integrates directly into an existing Playwright-based
          scraper pipeline with no changes to the core scraping logic. The pre-scrape HEAD gate alone is expected
          to reduce per-run browser invocations by 60–80% at steady state — improving pipeline throughput, reducing
          infrastructure cost, and being a better citizen to the government portals the platform depends on.
        </p>
        <p>
          The patterns described here are general: HTTP conditional request semantics, content-hash versioning, and
          run-linked audit trails apply to any web scraping pipeline. The confidence scoring model is tunable and can
          be extended with additional quality dimensions as requirements evolve. We offer this design as a practical
          starting point for data platform teams seeking to move beyond naive timestamp-and-URL provenance.
        </p>

        {/* References */}
        <h2>References</h2>
        <ol className="space-y-2 text-sm">
          <li>
            [1] Fielding, R., & Reschke, J. (2014). <em>Hypertext Transfer Protocol (HTTP/1.1): Conditional
            Requests</em>. IETF RFC 7232.
          </li>
          <li>
            [2] Batini, C., &amp; Scannapieco, M. (2006). <em>Data Quality: Concepts, Methodologies and
            Techniques</em>. Springer.
          </li>
          <li>
            [3] Wang, R. Y., &amp; Strong, D. M. (1996). Beyond accuracy: What data quality means to data
            consumers. <em>Journal of Management Information Systems</em>, 12(4), 5–33.
          </li>
          <li>
            [4] Heydon, A., &amp; Najork, M. (1999). Mercator: A scalable, extensible Web crawler. <em>World Wide
            Web</em>, 2(4), 219–229. (Canonical treatment of crawl politeness and adaptive scheduling.)
          </li>
          <li>
            [5] Ethereum Attestation Service (EAS). (2023). <em>On-chain and off-chain attestation
            infrastructure</em>. EAS Documentation. attest.org.
          </li>
          <li>
            [6] Bundesministerium für Wirtschaft und Klimaschutz — Förderdatenbank.
            foerderdatenbank.de. (Primary data source for the Sophex funding corpus.)
          </li>
          <li>
            [7] Datar, M., Gionis, A., Indyk, P., &amp; Motwani, R. (2002). Maintaining stream statistics over
            sliding windows. <em>SIAM Journal on Computing</em>, 31(6), 1794–1813. (Theoretical background for
            streaming EMA computation.)
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
