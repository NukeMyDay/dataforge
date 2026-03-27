// Research article: Primary Source Verification — Eliminating Intermediary Bias in Public Data Aggregation
// Published at /research/primary-source-verification

export default function ResearchPrimarySourceVerificationPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-8">
        <a href="/research" className="hover:text-brand-600 transition-colors">
          Research
        </a>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Primary Source Verification</span>
      </nav>

      {/* Header */}
      <header className="mb-12">
        <div className="flex gap-2 mb-4">
          <span className="badge bg-brand-50 text-brand-700 text-xs">Data Engineering</span>
          <span className="badge bg-gray-100 text-gray-600 text-xs">Whitepaper</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-4">
          Primary Source Verification — Eliminating Intermediary Bias in Public Data Aggregation
        </h1>
        <div className="flex items-center gap-4 text-sm text-gray-500 border-t border-b border-gray-100 py-4">
          <span>Sophex Research</span>
          <span>·</span>
          <time dateTime="2026-03-27">March 27, 2026</time>
          <span>·</span>
          <span>~18 min read</span>
        </div>
      </header>

      {/* Abstract */}
      <section className="bg-gray-50 rounded-xl p-6 mb-10 border border-gray-200">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Abstract</h2>
        <p className="text-gray-700 leading-relaxed">
          Public data aggregation platforms face a fundamental epistemological challenge: how can a downstream
          consumer trust that data accurately reflects what a primary authority published — and not an intermediary
          that silently modified, cached, or filtered it? This paper documents Sophex's primary source verification
          framework: a four-layer architecture combining formal authority registration, cryptographic fetch
          integrity logging, TLS certificate chain capture, and CDN/proxy intermediary detection. We describe
          the design rationale, the database schema, the verification API, and the empirical findings on German
          government web infrastructure. The central finding is that several federal portals — including{" "}
          <em>foerderdatenbank.de</em> — serve content through Cloudflare CDN, making body-hash verification
          inherently two-tiered: CDN-layer integrity is verifiable; origin-layer integrity requires government
          cooperation or origin-bypass techniques. We document an honest, pragmatic verification model that
          acknowledges this limitation while delivering meaningful, machine-readable provenance guarantees for
          every record in the corpus.
        </p>
      </section>

      {/* Article body */}
      <article className="prose prose-gray prose-lg max-w-none">

        {/* 1. Introduction */}
        <h2>1. Introduction</h2>
        <p>
          Government data is authoritative at its origin: the statute, the agency database, the official portal.
          But by the time that data reaches a third-party aggregator, it may have passed through several hops —
          CDN edge nodes, reverse proxies, scraping middleware, intermediary republication portals — each
          introducing the possibility of divergence between what the authority published and what the aggregator
          received and stored.
        </p>
        <p>
          For legally-sensitive data this divergence has material consequences. A founder who acts on a tax
          obligation listed incorrectly due to a stale CDN cache, or a grant applicant who follows a funding
          ceiling last updated by an intermediary portal months after the official source changed it, bears a
          direct cost from the platform's inability to verify the chain of custody between the primary authority
          and the stored record.
        </p>
        <p>
          Conventional approaches address this with timestamps and URLs. We argue this is insufficient. A URL
          proves nothing about what was retrieved at scrape time. A timestamp proves nothing about whether an
          intermediary modified the content before it arrived. What is needed is transport-level evidence: a
          cryptographic hash of the received response, a record of the TLS certificate that secured the
          connection, and a systematic inspection of headers that reveal CDN or proxy presence.
        </p>
        <p>
          This paper describes how Sophex implements these checks as a first-class system layer — the{" "}
          <em>primary source verification framework</em> — and discusses the implications for data trust in
          public-sector data aggregation at scale.
        </p>

        {/* 2. Threat Model */}
        <h2>2. Threat Model</h2>
        <p>
          Before designing a verification system it is necessary to be precise about what can go wrong. We
          identify four distinct intermediary threat classes relevant to public-data aggregation.
        </p>
        <h3>2.1 CDN Caching and Content Staleness</h3>
        <p>
          Content delivery networks such as Cloudflare, AWS CloudFront, and Akamai are deployed primarily to
          reduce origin load and improve response latency. They achieve this by caching responses at edge nodes
          close to the requester. A scraper that reaches a CDN edge node rather than the origin server receives
          a copy of the page as it was when the CDN last refreshed its cache — which may be hours or days old.
        </p>
        <p>
          Crucially, a CDN-served response is indistinguishable from an origin response based on HTTP status
          code and body content alone. The only reliable signal is the presence of CDN-specific headers such
          as <code>CF-Cache-Status</code> (Cloudflare), <code>X-Cache</code> (generic), <code>X-Amz-Cf-Id</code>{" "}
          (CloudFront), or <code>Age &gt; 0</code> (any caching proxy). Without inspecting these headers, a
          platform cannot know whether it received live origin data or a cached copy.
        </p>
        <h3>2.2 Reverse Proxy Header and Content Injection</h3>
        <p>
          Reverse proxies deployed in front of government web servers may strip, modify, or inject HTTP headers.
          Common modifications include removing <code>Server</code> headers for security hardening, adding{" "}
          <code>X-Frame-Options</code> or <code>Content-Security-Policy</code> headers, and in some cases
          injecting JavaScript analytics snippets or cookie consent overlays into the HTML body. The last
          category is directly relevant to body-hash verification: two fetches of the same page through a proxy
          that injects session-specific tokens will produce different SHA-256 hashes even if the substantive
          content is identical.
        </p>
        <h3>2.3 Intermediary Portal Republication Lag</h3>
        <p>
          Many German regulatory data points are available both from their primary authority and from aggregating
          portals operated by industry associations, chambers (IHK, HWK), or regional administrations. These
          portals consume primary source data on their own scrape schedules, which are frequently slower than
          the primary authority's update cadence. A platform that scrapes an IHK portal rather than the
          corresponding Bundesbehörde source may receive data that is days or weeks behind the authoritative
          version without any signal that the delay occurred.
        </p>
        <h3>2.4 TLS Termination at Intermediary</h3>
        <p>
          TLS encryption protects data in transit from the server's TLS termination point to the client. It
          does not prove that termination occurred at the origin server. A TLS-terminating reverse proxy or CDN
          PoP presents its own certificate — signed by a major CA (Let's Encrypt, DigiCert, Cloudflare's own
          CA) rather than a certificate directly controlled by the government authority. Inspecting the TLS
          certificate issuer provides a signal about where termination occurred: a Cloudflare-issued certificate
          on a .de government domain is evidence that CDN termination is in use.
        </p>

        {/* 3. Methodology */}
        <h2>3. Methodology</h2>
        <p>
          Sophex's verification framework addresses all four threat classes through four coordinated layers.
          Each layer captures a different class of evidence; together they provide the basis for a structured
          verification verdict.
        </p>
        <h3>3.1 Layer 1: Source Authority Registration</h3>
        <p>
          The foundation of verifiable provenance is knowing <em>which</em> sources are authoritative and{" "}
          <em>why</em>. A source registry formally documents every URL scraped by the platform, linking each
          to its founding statute, authority type, and the legal basis for its data coverage. This transforms
          the implicit assumption ("we scraped this URL, therefore it is authoritative") into an explicit,
          auditable claim that can be reviewed, updated, and challenged.
        </p>
        <p>
          Authority types are drawn from the German regulatory taxonomy: <strong>federal</strong> (Bundesbehörden),{" "}
          <strong>state</strong> (Länderbehörden), <strong>chamber</strong> (IHK, HWK, Ärztekammern), and{" "}
          <strong>association</strong> (Verbände with delegated regulatory authority). The distinction matters:
          a chamber portal republishing federal law is an intermediary source even if it has high institutional
          credibility; only the Bundesbehörde is the primary authority for that law.
        </p>
        <h3>3.2 Layer 2: Fetch Integrity Logging</h3>
        <p>
          For every URL scraped, a parallel raw HTTPS GET request captures the full HTTP response at the
          transport layer: HTTP status code, selected response headers, and a SHA-256 hash of the raw response
          body before any parsing or transformation. This hash is the transport fingerprint — it proves what
          bytes were received over the wire, without asserting anything about their semantic content.
        </p>
        <p>
          The transport fingerprint is distinct from the content hash stored on the data record itself. The
          content hash is computed after parsing and normalisation (stripping boilerplate, extracting structured
          fields). The transport fingerprint is computed before any processing. Both are stored: the content
          hash as the canonical record-level fingerprint; the transport fingerprint as the HTTP-layer evidence
          that can later be compared against an independent capture of the same URL.
        </p>
        <h3>3.3 Layer 3: TLS Certificate Chain Capture</h3>
        <p>
          Using Node.js socket-level inspection, each integrity fetch captures the TLS certificate presented
          by the server: the issuing CA (<code>tls_issuer</code>), and the certificate validity window
          (<code>tls_valid_from</code>, <code>tls_valid_to</code>). This provides two pieces of evidence: that
          the connection was TLS-secured (protecting transport integrity from the termination point), and
          whether the termination point is likely a CDN or origin server based on the issuing CA.
        </p>
        <p>
          A government domain presenting a certificate issued by "Cloudflare, Inc." or "Amazon" rather than a
          qualified German CA or the authority's own PKI is a strong signal that TLS terminates at a CDN PoP.
          While TLS termination at a CDN is a standard and legitimate deployment pattern, it is architecturally
          significant for verification purposes: the encrypted channel does not extend to the origin.
        </p>
        <h3>3.4 Layer 4: Intermediary Detection via Header Analysis</h3>
        <p>
          HTTP response headers contain reliable signals of CDN and proxy presence. The platform inspects the
          following header set on every integrity fetch:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Header</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Signal</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2"><code>CF-Cache-Status</code></td>
                <td className="border border-gray-200 px-4 py-2">Cloudflare CDN present; HIT/MISS/EXPIRED indicate cache state</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2"><code>X-Amz-Cf-Id</code></td>
                <td className="border border-gray-200 px-4 py-2">AWS CloudFront CDN present</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2"><code>X-Cache</code></td>
                <td className="border border-gray-200 px-4 py-2">Generic cache layer (Varnish, Nginx, CDN)</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2"><code>Via</code></td>
                <td className="border border-gray-200 px-4 py-2">Explicit proxy chain declaration (RFC 7230 §5.7.1)</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2"><code>X-Varnish</code></td>
                <td className="border border-gray-200 px-4 py-2">Varnish cache server present</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2"><code>Age</code> &gt; 0</td>
                <td className="border border-gray-200 px-4 py-2">Response served from cache, age in seconds</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          If any of these headers is present, <code>has_intermediary</code> is set to <code>true</code> and
          the detected headers are stored as structured JSON in <code>intermediary_flags</code>. This flag
          propagates to the verification verdict.
        </p>

        {/* 4. Implementation */}
        <h2>4. Implementation</h2>
        <h3>4.1 Database Schema</h3>
        <p>
          Two tables implement the framework. The <code>source_registry</code> table documents authority:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`source_registry
├── source_url        TEXT UNIQUE   — canonical URL of the scraped source
├── authority_name    VARCHAR(256)  — official name of the authority
├── authority_type    VARCHAR(64)   — federal | state | chamber | association
├── legal_basis       TEXT          — statute or ordinance granting authority
├── scraper_name      VARCHAR(128)  — name of the Sophex scraper module
├── data_domain       VARCHAR(128)  — subject area (e.g. "Steuerliche Pflichten")
├── notes             TEXT          — editorial notes on source selection
└── verified_at       TIMESTAMPTZ   — last manual authority verification`}
        </pre>
        <p>
          The <code>scrape_integrity_log</code> table records transport-level evidence per fetch:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`scrape_integrity_log
├── source_url          TEXT          — URL fetched
├── scraped_at          TIMESTAMPTZ   — fetch timestamp
├── response_hash       VARCHAR(64)   — SHA-256 of raw response body
├── http_status         INTEGER       — HTTP status code
├── http_headers        JSONB         — { Date, Content-Type, Server, ETag }
├── tls_issuer          TEXT          — TLS certificate issuing CA
├── tls_valid_from      TEXT          — certificate start date
├── tls_valid_to        TEXT          — certificate expiry date
├── intermediary_flags  JSONB         — detected CDN/proxy headers
├── has_intermediary    BOOLEAN       — true if any CDN/proxy signal detected
└── pipeline_run_id     INTEGER FK    — links to pipeline_runs`}
        </pre>
        <p>
          The <code>pipeline_run_id</code> foreign key is architecturally significant: it ensures every
          integrity log entry is traceable to the specific pipeline run that produced it, enabling operators
          to answer "which integrity captures occurred during run #87?" — useful when a pipeline run is
          later identified as having scraped from a degraded CDN PoP.
        </p>
        <h3>4.2 Verification API</h3>
        <p>
          Three REST endpoints expose the verification layer to API consumers:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`# List all registered sources with authority documentation
GET /v1/sources
Authorization: Bearer <api-key>

# Full source detail with recent integrity entries
GET /v1/sources/:id
Authorization: Bearer <api-key>

# Cryptographic verification report for a specific scrape event
GET /v1/verify/:recordId
Authorization: Bearer <api-key>`}
        </pre>
        <p>
          The <code>/v1/verify/:recordId</code> endpoint returns a structured verification report with a
          discrete verdict:
        </p>
        <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-sm overflow-x-auto">
          {`{
  "data": {
    "recordId": "foerderdatenbank-kfw-001",
    "sourceUrl": "https://www.foerderdatenbank.de/...",
    "verdict": "intermediary_detected",
    "responseHash": "3a7f1b4c...",
    "tlsIssuer": "Cloudflare, Inc.",
    "hasIntermediary": true,
    "intermediaryFlags": {
      "CF-Cache-Status": "HIT",
      "Age": "1847"
    },
    "scrapedAt": "2026-03-25T02:14:33Z",
    "pipelineRunId": 87
  },
  "meta": {
    "verificationLevel": "cdn_layer"
  },
  "error": null
}`}
        </pre>
        <h3>4.3 Verdict Logic</h3>
        <p>
          The verdict field takes one of four values, in descending order of verification confidence:
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Verdict</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Meaning</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2"><code>verified</code></td>
                <td className="border border-gray-200 px-4 py-2">Source is registered, no intermediary detected, TLS terminates at authority domain</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2"><code>intermediary_detected</code></td>
                <td className="border border-gray-200 px-4 py-2">Source is registered; CDN or proxy signals present — CDN-layer integrity only</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2"><code>unregistered_source</code></td>
                <td className="border border-gray-200 px-4 py-2">URL not in source registry — no authority claim has been made for this source</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2"><code>incomplete</code></td>
                <td className="border border-gray-200 px-4 py-2">Integrity log entry exists but is missing required fields (TLS or hash capture failed)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          The <code>intermediary_detected</code> verdict is not a failure state — it is an honest description
          of what was verified. It tells consumers that the response hash proves the CDN delivered consistent
          content across fetches, but does not prove that the CDN content matches the current origin. This
          distinction is critical for consumers making compliance-sensitive decisions.
        </p>

        {/* 5. Results */}
        <h2>5. Results</h2>
        <h3>5.1 CDN Deployment Across German Federal Portals</h3>
        <p>
          Integrity fetch tests across Sophex's 14 registered sources reveal significant CDN adoption among
          German federal portals. The primary finding: <strong>foerderdatenbank.de</strong>, operated by the
          Bundesministerium für Wirtschaft und Klimaschutz (BMWK) and the canonical primary source for Sophex's
          entire funding corpus, responds with <code>CF-Cache-Status: HIT</code> on standard GET requests.
          The response TLS certificate is issued by Cloudflare, Inc. — confirming that TLS termination occurs
          at a Cloudflare PoP, not at BMWK infrastructure.
        </p>
        <p>
          This means every integrity hash captured from foerderdatenbank.de is a hash of CDN-delivered content.
          The hash remains cryptographically useful — two independent fetches that produce the same hash
          confirm CDN-layer consistency — but it cannot substitute for an origin-layer verification without
          access to the origin server directly.
        </p>
        <h3>5.2 Two-Tiered Verification Model</h3>
        <p>
          The CDN finding necessitates an explicit two-tiered verification model:
        </p>
        <ol>
          <li>
            <strong>CDN-layer verification</strong>: the <code>response_hash</code> confirms that the CDN
            delivered consistent content across independent fetches. The <code>tls_issuer</code> identifies
            the CDN operator. The <code>intermediary_flags</code> document cache state at the time of fetch.
          </li>
          <li>
            <strong>Origin-layer verification</strong>: requires either (a) an origin-bypass request path
            (feasible only with government IT cooperation), or (b) a conditional GET issued at a time when
            the CDN cache is known to have expired (probabilistic, not guaranteed).
          </li>
        </ol>
        <p>
          For the current production scope, CDN-layer verification is the achievable standard. The{" "}
          <code>verification_level: "cdn_layer"</code> field in API responses communicates this explicitly so
          that consumers understand what has and has not been proven.
        </p>
        <h3>5.3 Body Hash Variability</h3>
        <p>
          Testing also reveals that raw response body hashes are not stable across successive fetches of
          unchanged content. Common causes include session tokens embedded in HTML responses, CDN-injected
          scripts (Cloudflare's bot detection JavaScript), dynamic nonces in Content Security Policy headers
          carried into the body, and gzip compression with differing dictionaries across PoPs. Two fetches of
          the same unchanged funding program page produced different SHA-256 hashes in approximately 15% of
          test cases.
        </p>
        <p>
          This confirms that the <code>response_hash</code> should be treated as transport-level evidence,
          not as a semantic content fingerprint. The content hash stored on the data record (computed after
          parsing and normalisation) remains the canonical record-level integrity signal. The two hashes
          serve complementary purposes and should not be conflated.
        </p>

        {/* 6. Discussion */}
        <h2>6. Discussion</h2>
        <h3>6.1 Limitations</h3>
        <p>
          The primary limitation of the current implementation is the absence of origin-layer verification
          for CDN-fronted sources. TLS pinning — establishing an expected certificate fingerprint for each
          source and failing verification if the presented certificate does not match — is not practical at
          scale for public-sector data aggregation. Government domains rotate certificates regularly (Let's
          Encrypt's 90-day certificates, automated renewal pipelines), and a CDN deployment may use
          Cloudflare's shared certificate infrastructure, making a specific certificate fingerprint
          meaningless as an authenticity signal [1].
        </p>
        <p>
          A second limitation is that intermediary detection is header-based and therefore bypassable. A CDN
          configured to strip its telltale headers (Cloudflare's "orange-cloud" mode with header stripping
          enabled, for instance) would not be detected by the current approach. For government portals this
          is a low-probability threat — stripping CDN headers is not a common hardening practice — but it
          means the <code>has_intermediary: false</code> verdict is evidence of absence of detected intermediary
          signals, not proof of direct origin access.
        </p>
        <p>
          Third, the <code>response_hash</code> variability documented in §5.3 means that body hashes cannot
          currently be used for content-change detection across scrape runs. This limits the transport fingerprint
          to same-session consistency checking rather than cross-run comparison. Semantic hashing — computing
          a hash of the parsed, normalised content rather than the raw body — is the correct solution and
          is already implemented at the record level via the <code>content_hash</code> field on data tables.
        </p>
        <h3>6.2 Future Work</h3>
        <p>
          <strong>Semantic canonical hashing.</strong> Stripping dynamic elements (session tokens, CDN scripts,
          dynamic nonces) before hashing would produce stable transport-level fingerprints comparable across
          independent fetches and across scrape runs. This bridges the gap between transport-layer evidence
          and content-layer verification.
        </p>
        <p>
          <strong>Origin-bypass for CDN-fronted sources.</strong> For sources where data integrity is critical
          and CDN deployment is confirmed, direct outreach to the government IT operator to request an
          allowlisted origin-direct access path would enable full two-tier verification. This is a governance
          task, not a technical one, but the verification framework provides the documented justification for
          the request.
        </p>
        <p>
          <strong>Per-record integrity proof links.</strong> Adding a <code>scrape_integrity_log_id</code>{" "}
          foreign key to each data table would link every stored record directly to the specific integrity log
          entry from the fetch that produced it. Currently the link exists at the pipeline run level; per-record
          linkage enables consumers to retrieve the exact transport fingerprint for any individual record.
        </p>
        <p>
          <strong>On-chain hash anchoring.</strong> Periodically publishing Merkle roots of{" "}
          <code>(source_url, response_hash, scraped_at)</code> tuples to a public attestation layer [5]
          provides tamper-evident proof that a given hash was observed at a given time, without requiring
          trust in the platform operator's database. This is explored as a separate work stream (DAT-43).
        </p>

        {/* 7. Conclusion */}
        <h2>7. Conclusion</h2>
        <p>
          The primary source verification framework described in this paper transforms an implicit assumption
          — "data from this URL is authoritative" — into an explicit, structured, and queryable claim. The
          source registry documents the authority chain. The scrape integrity log provides cryptographic
          evidence of what was received and under what transport conditions. TLS certificate capture identifies
          the termination point. Intermediary header detection surfaces CDN presence.
        </p>
        <p>
          The central empirical finding — that foerderdatenbank.de, the canonical primary source for German
          federal funding data, is CDN-fronted — motivates the honest two-tiered verification model. We do not
          claim to have solved origin-layer verification for CDN-fronted government sources; we claim to have
          built the infrastructure to answer, for every record in the corpus: where did this data come from,
          under what transport conditions, and what class of integrity guarantee can we provide?
        </p>
        <p>
          The verdict field in the verification API makes this explicit and machine-readable. A consumer
          receiving <code>"verdict": "intermediary_detected"</code> knows they have CDN-layer integrity; a
          consumer receiving <code>"verdict": "verified"</code> knows they have origin-layer integrity. Both
          are useful. Neither overstates what was proven.
        </p>

        {/* References */}
        <h2>References</h2>
        <ol className="space-y-2 text-sm">
          <li>
            [1] Rescorla, E. (2018). <em>The Transport Layer Security (TLS) Protocol Version 1.3</em>. IETF
            RFC 8446. Section 4.4.2: Certificate verification and chain of trust.
          </li>
          <li>
            [2] Cooper, D., Santesson, S., Farrell, S., Boeyen, S., Housley, R., &amp; Polk, W. (2008).{" "}
            <em>Internet X.509 Public Key Infrastructure Certificate and Certificate Revocation List (CRL)
            Profile</em>. IETF RFC 5280. (Authoritative specification for TLS certificate structure and
            validation.)
          </li>
          <li>
            [3] Fielding, R., &amp; Reschke, J. (2014). <em>Hypertext Transfer Protocol (HTTP/1.1): Message
            Syntax and Routing</em>. IETF RFC 7230. §5.7: Message forwarding and the <code>Via</code> header.
          </li>
          <li>
            [4] Batini, C., &amp; Scannapieco, M. (2006). <em>Data Quality: Concepts, Methodologies and
            Techniques</em>. Springer. Chapter 3: Data quality dimensions including accuracy, currency, and
            lineage.
          </li>
          <li>
            [5] Ethereum Attestation Service (EAS). (2023). <em>On-chain and off-chain attestation
            infrastructure for verifiable claims</em>. EAS Documentation. attest.org. (Candidate for
            DAT-43 on-chain hash anchoring implementation.)
          </li>
          <li>
            [6] Sundareswaran, S., Squicciarini, A. C., &amp; Lin, D. (2012). Ensuring distributed
            accountability for data sharing in the cloud. <em>IEEE Transactions on Dependable and Secure
            Computing</em>, 9(4), 556–568. (Formal treatment of data provenance in distributed
            intermediary chains.)
          </li>
          <li>
            [7] Bundesministerium für Wirtschaft und Klimaschutz — Förderdatenbank. foerderdatenbank.de.
            (Primary federal source for Sophex funding corpus; confirmed Cloudflare CDN deployment.)
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
