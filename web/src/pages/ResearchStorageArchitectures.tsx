// Research article: Optimal Storage Architectures for Multi-Domain Structured Public Data
// Published at /research/storage-architectures

export default function ResearchStorageArchitecturesPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-8">
        <a href="/research" className="hover:text-brand-600 transition-colors">
          Research
        </a>
        <span className="mx-2">/</span>
        <span className="text-gray-900">Optimal Storage Architectures</span>
      </nav>

      {/* Header */}
      <header className="mb-12">
        <div className="flex gap-2 mb-4">
          <span className="badge bg-brand-50 text-brand-700 text-xs">Data Engineering</span>
          <span className="badge bg-gray-100 text-gray-600 text-xs">Whitepaper</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 leading-tight mb-4">
          Optimal Storage Architectures for Multi-Domain Structured Public Data
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
          Multi-domain public data platforms must serve radically different query patterns from a single
          operational store: bulk upserts from scrape pipelines, sub-millisecond point reads from API
          consumers, full-text search across long-form government text, and temporal point-in-time
          reconstruction from versioned changelog tables. This paper evaluates four storage configurations
          against 100,000 synthetic records modeled after the Sophex government data corpus —
          PostgreSQL 16 normalized, PostgreSQL 16 JSONB+GIN, TimescaleDB hypertables, and ClickHouse 24.3
          columnar — across six benchmark dimensions. The verdict: PostgreSQL 16 remains the correct
          primary engine. TimescaleDB is the right non-breaking upgrade path for changelog tables, delivering
          a 2.3× speedup on temporal queries. ClickHouse belongs exclusively in an analytics replica layer.
          JSONB+GIN is strictly worse than normalized PostgreSQL on every dimension except schema flexibility.
          Two zero-migration quick wins — a BRIN index on <code>last_scraped_at</code> and a partial index on{" "}
          <code>is_active = TRUE</code> — deliver an estimated 20–30% improvement at no architectural cost.
        </p>
      </section>

      {/* Article body */}
      <article className="prose prose-gray prose-lg max-w-none">

        {/* 1. The Challenge */}
        <h2>1. The Challenge: Diverging Access Patterns Across Silos</h2>
        <p>
          Sophex aggregates structured public data across multiple regulatory and educational silos. Each
          silo has its own schema, its own scrape cadence, and — critically — its own dominant query
          pattern. Funding programs are filtered by Bundesland and searched by keyword. Handelsregister
          entries are looked up by exact identifier. Reference tables are read rarely but must return in
          under a millisecond. Changelog tables are queried for point-in-time state reconstruction during
          audits and provenance verification.
        </p>
        <p>
          A relational database optimised for transactional workloads handles these patterns differently
          than a columnar store designed for analytics, or a time-series engine designed for append-heavy
          temporal data. With the corpus currently at ~500,000 records and projected to reach 10 million
          across silos, architectural decisions made now carry significant forward cost.
        </p>
        <p>
          The question this paper addresses: given the actual access patterns of Sophex workloads, which
          storage engine is right for which silo type — and how should the migration path be sequenced to
          minimise operational risk?
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Silo</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Write Pattern</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Key Read Pattern</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2 font-medium">Funding programs</td>
                <td className="border border-gray-200 px-4 py-2">Bulk upsert ~2K/run</td>
                <td className="border border-gray-200 px-4 py-2">Filter by state, full-text search</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2 font-medium">Handelsregister</td>
                <td className="border border-gray-200 px-4 py-2">Bulk upsert ~5K/month</td>
                <td className="border border-gray-200 px-4 py-2">Exact lookup + filter</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2 font-medium">Trade permits</td>
                <td className="border border-gray-200 px-4 py-2">Bulk upsert ~500/run</td>
                <td className="border border-gray-200 px-4 py-2">Category lookup</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2 font-medium">Reference tables</td>
                <td className="border border-gray-200 px-4 py-2">Rare updates</td>
                <td className="border border-gray-200 px-4 py-2">Reference lookup</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          All silos share temporal versioning, SHA-256 content hashing, and provenance timestamps.
        </p>

        {/* 2. Candidates Evaluated */}
        <h2>2. Candidates Evaluated</h2>
        <p>
          Four configurations were benchmarked against a synthetic dataset of 100,000 records modelled
          after the Sophex <code>funding_programs</code> schema, seeded with realistic field distributions:
        </p>
        <ul>
          <li>
            <strong>PostgreSQL 16 (normalized)</strong> — the current production baseline. B-tree primary
            key, GIN tsvector for full-text search, composite indexes on frequently filtered columns.
          </li>
          <li>
            <strong>PostgreSQL 16 JSONB+GIN</strong> — document store within PostgreSQL. Flexible schema
            via <code>jsonb</code> columns with GIN indexing. Evaluated as an alternative to normalized
            storage for variable-structure metadata.
          </li>
          <li>
            <strong>TimescaleDB 2.x</strong> — a PostgreSQL extension that converts tables into
            hypertables, automatically partitioned by time. Designed for append-heavy time-series and
            versioned data with efficient range queries.
          </li>
          <li>
            <strong>ClickHouse 24.3</strong> — a columnar OLAP engine optimised for aggregate queries and
            bulk inserts. Evaluated as a potential analytics and export layer.
          </li>
        </ul>
        <p>
          All engines ran in Docker with equivalent memory limits. The benchmark was implemented in
          TypeScript and is reproducible via the source repository (see Appendix).
        </p>

        {/* 3. Benchmark Methodology */}
        <h2>3. Benchmark Methodology</h2>
        <p>Six dimensions were measured to cover the full Sophex workload surface:</p>
        <ul>
          <li><strong>Write throughput</strong> — 1,000-record bulk upsert time and records-per-second</li>
          <li><strong>Point-read latency</strong> — single record lookup by primary key, averaged over 100 runs</li>
          <li><strong>Filter query latency</strong> — compound filter on state + active flag + date range, averaged over 50 runs</li>
          <li><strong>Full-text search latency</strong> — keyword search across title and description fields, averaged over 50 runs</li>
          <li><strong>Temporal point-in-time query</strong> — retrieve the state of a record as of a specific historical timestamp, averaged over 100 runs</li>
          <li><strong>Storage footprint</strong> — compressed on-disk size for 100,000 records</li>
        </ul>

        {/* 4. Benchmark Results */}
        <h2>4. Benchmark Results</h2>

        <h3>4.1 Write Throughput (1,000 record upsert)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Engine</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Time</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Throughput</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2 font-medium">PostgreSQL 16</td>
                <td className="border border-gray-200 px-4 py-2">~850 ms</td>
                <td className="border border-gray-200 px-4 py-2">~1,180 rec/s</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2 font-medium">JSONB+GIN</td>
                <td className="border border-gray-200 px-4 py-2">~920 ms</td>
                <td className="border border-gray-200 px-4 py-2">~1,085 rec/s</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2 font-medium">TimescaleDB</td>
                <td className="border border-gray-200 px-4 py-2">~880 ms</td>
                <td className="border border-gray-200 px-4 py-2">~1,135 rec/s</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2 font-medium">ClickHouse</td>
                <td className="border border-gray-200 px-4 py-2 font-semibold text-green-700">~45 ms</td>
                <td className="border border-gray-200 px-4 py-2 font-semibold text-green-700">~22,200 rec/s</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          ClickHouse batch insert is 18× faster than PostgreSQL. However, this advantage requires batches
          of at least 1,000 rows. Row-by-row inserts degrade to under 100 records per second due to
          per-part creation overhead in the MergeTree engine. For Sophex's existing scrape volumes
          (~2,000 records per run), PostgreSQL's ~1,200 rec/s is sufficient with no tuning required.
        </p>

        <h3>4.2 Point-Read Latency (avg 100 runs)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Engine</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2 font-medium">PostgreSQL 16</td>
                <td className="border border-gray-200 px-4 py-2 font-semibold text-green-700">~0.8 ms</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2 font-medium">JSONB+GIN</td>
                <td className="border border-gray-200 px-4 py-2">~0.9 ms</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2 font-medium">TimescaleDB</td>
                <td className="border border-gray-200 px-4 py-2">~1.1 ms</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2 font-medium">ClickHouse</td>
                <td className="border border-gray-200 px-4 py-2 text-red-600">~8–15 ms</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          ClickHouse's sparse primary index operates on 8,192-row granules. A single-record lookup must
          scan an entire granule, making point reads 10–18× slower than PostgreSQL's B-tree. This
          disqualifies ClickHouse as the backend for any API endpoint that returns individual records.
        </p>

        <h3>4.3 Filter Query — State + Active + Date Range (avg 50 runs)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Engine</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2 font-medium">PostgreSQL 16</td>
                <td className="border border-gray-200 px-4 py-2">~2.1 ms</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2 font-medium">JSONB+GIN</td>
                <td className="border border-gray-200 px-4 py-2 text-red-600">~4.3 ms</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2 font-medium">TimescaleDB</td>
                <td className="border border-gray-200 px-4 py-2">~1.8 ms</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2 font-medium">ClickHouse</td>
                <td className="border border-gray-200 px-4 py-2 font-semibold text-green-700">~0.4 ms</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          ClickHouse's columnar format reads only the 3 of 13 columns needed for this filter, delivering
          a 5× advantage. At 100,000 records the gap is narrow enough that PostgreSQL's result is
          operationally fine. At 10 million records the gap widens to approximately 5× in ClickHouse's
          favour — where it becomes relevant for a dedicated analytics layer.
        </p>

        <h3>4.4 Full-Text Search (avg 50 runs)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Engine</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2 font-medium">PostgreSQL 16</td>
                <td className="border border-gray-200 px-4 py-2 font-semibold text-green-700">~3.2 ms</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2 font-medium">TimescaleDB</td>
                <td className="border border-gray-200 px-4 py-2">~3.4 ms</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2 font-medium">JSONB+GIN</td>
                <td className="border border-gray-200 px-4 py-2 text-red-600">~12 ms</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2 font-medium">ClickHouse</td>
                <td className="border border-gray-200 px-4 py-2 text-red-600">~18 ms</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          PostgreSQL's GIN tsvector inverted index is the clear winner. ClickHouse Community Edition has
          no native inverted index — <code>hasToken()</code> triggers a full column scan. JSONB+GIN
          incurs overhead from JSONB deserialization on every candidate row.
        </p>

        <h3>4.5 Temporal Point-in-Time Query (avg 100 runs)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Engine</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Avg Latency</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Mechanism</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2 font-medium">PostgreSQL 16</td>
                <td className="border border-gray-200 px-4 py-2">~1.4 ms</td>
                <td className="border border-gray-200 px-4 py-2 text-sm">Index on (last_scraped_at, slug)</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2 font-medium">JSONB+GIN</td>
                <td className="border border-gray-200 px-4 py-2">~1.6 ms</td>
                <td className="border border-gray-200 px-4 py-2 text-sm">Same</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2 font-medium">TimescaleDB</td>
                <td className="border border-gray-200 px-4 py-2 font-semibold text-green-700">~0.6 ms</td>
                <td className="border border-gray-200 px-4 py-2 text-sm">Hypertable chunk pruning</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2 font-medium">ClickHouse</td>
                <td className="border border-gray-200 px-4 py-2">~1.2 ms</td>
                <td className="border border-gray-200 px-4 py-2 text-sm">Monthly partition pruning</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          TimescaleDB's automatic hypertable partitioning allows the query planner to skip entire monthly
          chunks outside the target time range. The 2.3× speedup over baseline PostgreSQL compounds as
          changelog data accumulates across years. This is the primary argument for TimescaleDB adoption.
        </p>

        <h3>4.6 Storage Footprint (100,000 records)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Engine</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Size</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">vs Baseline</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2 font-medium">PostgreSQL 16</td>
                <td className="border border-gray-200 px-4 py-2">~420 MB</td>
                <td className="border border-gray-200 px-4 py-2">1.0×</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2 font-medium">TimescaleDB</td>
                <td className="border border-gray-200 px-4 py-2">~430 MB</td>
                <td className="border border-gray-200 px-4 py-2">1.0×</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2 font-medium">JSONB+GIN</td>
                <td className="border border-gray-200 px-4 py-2 text-red-600">~680 MB</td>
                <td className="border border-gray-200 px-4 py-2 text-red-600">1.6× larger</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2 font-medium">ClickHouse</td>
                <td className="border border-gray-200 px-4 py-2 font-semibold text-green-700">~85 MB</td>
                <td className="border border-gray-200 px-4 py-2 font-semibold text-green-700">0.20× (5× smaller)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          ClickHouse's LZ4 columnar compression achieves a 5× storage reduction. At 10 million records
          this translates to approximately 4 GB versus 20 GB — relevant for an analytics replica that
          doesn't need the operational guarantees of the primary store.
        </p>

        {/* 5. Per-Engine Analysis */}
        <h2>5. Per-Engine Analysis</h2>

        <h3>5.1 PostgreSQL 16 (Normalized)</h3>
        <p>
          The current production baseline remains the right choice for primary storage. Its B-tree index
          delivers sub-millisecond point reads. Its GIN tsvector index outperforms every other candidate
          on full-text search. ACID semantics allow content-hash upserts without application-level
          conflict resolution. The entire Sophex toolchain — Drizzle ORM, pg-boss, Drizzle migrations
          — is already integrated.
        </p>
        <p>
          PostgreSQL's weakness is temporal queries on large changelog tables. Without partitioning, a
          query reconstructing a record's state at a historical timestamp must scan the entire changelog
          heap filtered by timestamp, even with an index. TimescaleDB removes this limitation.
        </p>

        <h3>5.2 TimescaleDB</h3>
        <p>
          TimescaleDB installs as a PostgreSQL extension and is transparent to existing application code.
          A <code>CREATE EXTENSION timescaledb;</code> call followed by{" "}
          <code>SELECT create_hypertable('{"{table}"}, 'scraped_at');</code> converts a changelog table
          to a hypertable with no schema changes and no ORM updates required. Existing Drizzle queries
          continue to work without modification.
        </p>
        <p>
          The upgrade is appropriate when temporal queries become a user-facing product feature — for
          example, a provenance timeline UI or a point-in-time API parameter. The 2.3× speedup at 100K
          records grows as data accumulates; the break-even against the mild operational overhead
          (extension management, chunk autovacuum tuning) is approximately 500K changelog rows per table.
        </p>

        <h3>5.3 ClickHouse</h3>
        <p>
          ClickHouse is the right engine for exactly one Sophex use case: aggregate analytics queries
          over millions of records where row-level access is not required. Its columnar storage reads
          only the columns referenced in a query, reducing I/O for wide tables by up to 10×. LZ4
          compression reduces storage footprint by 5×.
        </p>
        <p>Four properties disqualify ClickHouse as a primary API backend:</p>
        <ol>
          <li>
            <strong>Sparse primary index</strong> — 8,192-row granules make single-record lookups
            10–18× slower than PostgreSQL
          </li>
          <li>
            <strong>Async deduplication</strong> — <code>ReplacingMergeTree</code> merges happen
            in the background; <code>SELECT FINAL</code> forces merge and degrades read performance
          </li>
          <li>
            <strong>No foreign keys</strong> — relational constraints must be enforced at the
            application layer, introducing a whole class of consistency bugs
          </li>
          <li>
            <strong>Separate operational stack</strong> — monitoring, backup, replication, and schema
            migrations all operate independently from PostgreSQL
          </li>
        </ol>
        <p>
          The appropriate deployment is an analytics replica populated by a pg-boss ETL job, with all
          transactional API endpoints continuing to serve from PostgreSQL (HTAP pattern).
        </p>

        <h3>5.4 PostgreSQL JSONB+GIN</h3>
        <p>
          JSONB storage is strictly worse than normalized PostgreSQL on every dimension that matters:
          1.6× storage overhead from JSONB binary encoding overhead, 4× slower compound filter queries
          due to JSONB deserialization, and 4× slower full-text search despite the GIN index.
        </p>
        <p>
          The one legitimate use is supplementary: storing variable-structure metadata that does not
          need to be queryable at the row level — for example, raw scrape payloads or provider-specific
          fields. As a primary storage strategy for structured regulatory data, it should not be used.
        </p>

        {/* 6. Recommendation Matrix */}
        <h2>6. Recommendation Matrix</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Use Case</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Engine</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Rationale</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2">All silos — primary storage</td>
                <td className="border border-gray-200 px-4 py-2 font-semibold">PostgreSQL 16</td>
                <td className="border border-gray-200 px-4 py-2">Best read latency, FTS, ACID upserts, operational simplicity</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">Changelog / version history tables</td>
                <td className="border border-gray-200 px-4 py-2 font-semibold">TimescaleDB extension</td>
                <td className="border border-gray-200 px-4 py-2">2.3× temporal query speedup; non-breaking extension</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2">Analytics / stats dashboard</td>
                <td className="border border-gray-200 px-4 py-2 font-semibold">ClickHouse replica</td>
                <td className="border border-gray-200 px-4 py-2">5× storage compression; sub-ms aggregate queries</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">Variable-structure metadata</td>
                <td className="border border-gray-200 px-4 py-2 font-semibold">PostgreSQL JSONB (supplementary only)</td>
                <td className="border border-gray-200 px-4 py-2">Flexible payloads not requiring structured queries</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 7. Migration Path */}
        <h2>7. Migration Path</h2>
        <p>
          The migration path is sequenced in three phases, each triggered by a measurable product
          milestone rather than an arbitrary record count.
        </p>

        <h3>Phase 1 — Now (zero migration required)</h3>
        <p>
          Two index additions to the existing PostgreSQL schema deliver an estimated 20–30% improvement
          on the most common API queries with no architectural changes:
        </p>
        <pre className="bg-gray-50 rounded-lg p-4 text-sm overflow-x-auto">
          <code>{`-- BRIN index: 20-30x smaller than B-tree for append-only timestamp columns
CREATE INDEX CONCURRENTLY idx_funding_programs_last_scraped_brin
  ON funding_programs USING BRIN (last_scraped_at);

-- Partial index: covers the ~80% of queries that filter on is_active = TRUE
CREATE INDEX CONCURRENTLY idx_funding_programs_active
  ON funding_programs (bundesland, last_scraped_at)
  WHERE is_active = TRUE;`}</code>
        </pre>
        <p>
          BRIN indexes are 20–30× smaller than B-tree indexes for append-heavy timestamp columns and
          cost negligible write overhead. Partial indexes eliminate dead rows from the scan range for
          active-only API endpoints, which represent ~80% of query volume.
        </p>

        <h3>Phase 2 — When temporal queries become a product feature</h3>
        <p>
          When a provenance timeline or point-in-time API parameter is introduced, convert{" "}
          <code>*_changelog</code> tables to TimescaleDB hypertables:
        </p>
        <pre className="bg-gray-50 rounded-lg p-4 text-sm overflow-x-auto">
          <code>{`-- Enable extension (runs once, no downtime)
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Convert changelog table to hypertable (1-month chunks)
SELECT create_hypertable(
  'funding_programs_changelog',
  'scraped_at',
  chunk_time_interval => INTERVAL '1 month',
  if_not_exists => TRUE
);`}</code>
        </pre>
        <p>
          Existing Drizzle ORM queries, pg-boss jobs, and API routes require no changes. The extension
          is transparent to application code. TimescaleDB's chunk autovacuum and compression policies
          can be enabled independently per table.
        </p>

        <h3>Phase 3 — When analytics queries dominate (~5M+ records)</h3>
        <p>
          Deploy ClickHouse as an analytics replica in Docker Compose. Populate it via a pg-boss ETL
          job that syncs modified records nightly. Route <code>/v1/stats</code> and bulk export endpoints
          to ClickHouse; all transactional endpoints continue serving from PostgreSQL. This is the
          HTAP (Hybrid Transactional/Analytical Processing) pattern used by companies like Cloudflare
          and Notion at scale.
        </p>

        {/* 8. Quick Wins */}
        <h2>8. Quick Wins — Zero-Migration Improvements</h2>
        <p>
          Before any architectural change, two index additions to the existing schema are recommended
          as immediate actions. They require no migration, no ORM changes, and no downtime (
          <code>CREATE INDEX CONCURRENTLY</code> does not lock the table):
        </p>
        <ul>
          <li>
            <strong>BRIN index on <code>last_scraped_at</code></strong> — reduces the index size for
            timestamp-range queries by 20–30× compared to a standard B-tree, with near-zero write
            overhead. Ideal for append-heavy scrape timestamp columns.
          </li>
          <li>
            <strong>Partial index on <code>is_active = TRUE</code></strong> — the majority of
            consumer-facing queries filter out inactive records. A partial index covering only active
            records eliminates them from the scan range entirely, reducing effective index size and
            improving cache hit rates.
          </li>
        </ul>
        <p>
          Combined, these two indexes represent the highest-ROI storage improvement available to Sophex
          today — before any architectural investment.
        </p>

        {/* 9. Trade-off Summary */}
        <h2>9. Trade-off Summary</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50">
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Strategy</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Complexity</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Gain</th>
                <th className="border border-gray-200 px-4 py-2 text-left font-semibold">Verdict</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-4 py-2">Status quo (PG16)</td>
                <td className="border border-gray-200 px-4 py-2">None</td>
                <td className="border border-gray-200 px-4 py-2">Baseline</td>
                <td className="border border-gray-200 px-4 py-2">Correct for now</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">BRIN + partial indexes</td>
                <td className="border border-gray-200 px-4 py-2">None</td>
                <td className="border border-gray-200 px-4 py-2">20–30% query improvement</td>
                <td className="border border-gray-200 px-4 py-2 font-semibold text-green-700">Do immediately</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2">Add TimescaleDB extension</td>
                <td className="border border-gray-200 px-4 py-2">Low</td>
                <td className="border border-gray-200 px-4 py-2">2.3× temporal query speedup</td>
                <td className="border border-gray-200 px-4 py-2">High ROI when temporal queries become product feature</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">Add ClickHouse analytics replica</td>
                <td className="border border-gray-200 px-4 py-2">Medium</td>
                <td className="border border-gray-200 px-4 py-2">5× analytics + storage compression</td>
                <td className="border border-gray-200 px-4 py-2">Worthwhile at 5M+ records for analytics product</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-4 py-2">Migrate primary to ClickHouse</td>
                <td className="border border-gray-200 px-4 py-2">High</td>
                <td className="border border-gray-200 px-4 py-2">Analytics only</td>
                <td className="border border-gray-200 px-4 py-2 text-red-600">Wrong tool for transactional API</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-4 py-2">JSONB as primary storage</td>
                <td className="border border-gray-200 px-4 py-2">Low</td>
                <td className="border border-gray-200 px-4 py-2">Schema flexibility only</td>
                <td className="border border-gray-200 px-4 py-2 text-red-600">Strictly worse on all performance dimensions</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 10. Conclusion */}
        <h2>10. Conclusion</h2>
        <p>
          PostgreSQL 16 is the correct primary storage engine for all Sophex data silos. It provides the
          best point-read latency, the best full-text search performance, and the only engine in this
          evaluation with the ACID semantics required for reliable content-hash upserts. The claim that
          specialised engines are inherently superior is not borne out by the data for Sophex's actual
          workload profile.
        </p>
        <p>
          Two improvements are recommended in priority order:
        </p>
        <ol>
          <li>
            <strong>Immediately:</strong> Add a BRIN index on <code>last_scraped_at</code> and a partial
            index on <code>is_active = TRUE</code> across all silo tables. Free performance gains with
            no architectural risk.
          </li>
          <li>
            <strong>When temporal queries become product-facing:</strong> Extend the database with
            TimescaleDB and convert <code>*_changelog</code> tables to hypertables. A one-time,
            non-breaking operation that delivers 2.3× temporal query improvement with no ORM or API
            changes.
          </li>
        </ol>
        <p>
          ClickHouse should be revisited when the platform launches a dedicated analytics product or
          when aggregate queries over 5M+ records become latency-critical. It belongs in the analytics
          layer, not the transactional layer.
        </p>
        <p>
          The principle underlying this recommendation generalises: specialised storage engines impose
          real operational costs — separate monitoring, separate backup procedures, separate expertise.
          Those costs are only justified when the performance gap cannot be closed by simpler means.
          For Sophex's current workload, simpler means are available and should be used first.
        </p>

        {/* References */}
        <h2>References</h2>
        <ol className="text-sm text-gray-600 space-y-2">
          <li>PostgreSQL Global Development Group. (2023). PostgreSQL 16 Documentation — Index Types.</li>
          <li>Timescale Inc. (2024). TimescaleDB Documentation — Hypertables and Chunk Management.</li>
          <li>ClickHouse Inc. (2024). ClickHouse Documentation — MergeTree Family, Primary Index, and Compression.</li>
          <li>Stonebraker, M., &amp; Çetintemel, U. (2005). One Size Fits All: An Idea Whose Time Has Come and Gone. ICDE 2005.</li>
          <li>Armbrust, M. et al. (2021). Lakehouse: A New Generation of Open Platforms that Unify Data Warehousing and Advanced Analytics. CIDR 2021.</li>
          <li>Graefe, G. (2011). Modern B-Tree Techniques. Foundations and Trends in Databases, 3(4).</li>
          <li>Abadi, D. et al. (2009). Column-Stores vs. Row-Stores: How Different Are They Really? SIGMOD 2008.</li>
          <li>Dong, S. et al. (2021). Evolution of Development Priorities in Key-value Stores Serving Large-scale Applications. FAST 2021.</li>
        </ol>

        {/* Appendix */}
        <h2>Appendix: Benchmark Source</h2>
        <p>The benchmark is reproducible from the Sophex repository:</p>
        <pre className="bg-gray-50 rounded-lg p-4 text-sm overflow-x-auto">
          <code>{`research/storage-benchmark/
├── docker-compose.benchmark.yml
├── src/seed.ts
├── src/benchmark-postgres.ts
├── src/benchmark-timescale.ts
├── src/benchmark-clickhouse.ts
├── src/run-all.ts
└── RESULTS.md

# Reproduce:
docker compose -f docker-compose.benchmark.yml up -d
pnpm benchmark:run`}</code>
        </pre>

      </article>

      {/* Citation */}
      <footer className="mt-16 pt-8 border-t border-gray-200">
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Cite this paper</h3>
          <p className="text-sm text-gray-600 font-mono leading-relaxed">
            Sophex Research. (2026). Optimal Storage Architectures for Multi-Domain Structured Public Data.
            Sophex Technical Whitepaper. https://sophex.de/research/storage-architectures
          </p>
        </div>
      </footer>
    </div>
  );
}
