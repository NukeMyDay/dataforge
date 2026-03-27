/**
 * Benchmark: ClickHouse 24.3 — Columnar OLAP Engine
 *
 * ClickHouse uses an HTTP API (port 8123) and a native TCP client.
 * We use the HTTP interface here to keep dependencies minimal.
 *
 * Key hypothesis: ClickHouse should outperform PostgreSQL on:
 *   - Analytical filter queries (column pruning avoids reading unused columns)
 *   - Aggregations / group-bys over large scan windows
 *
 * But it is NOT a good fit for:
 *   - Single-record CRUD (no efficient row lookup)
 *   - Small writes (needs batch inserts ≥ 1K rows; random inserts are anti-pattern)
 *   - Upserts (requires ReplacingMergeTree + deduplication, which is async)
 */

import { generateRecords, type SeedRecord } from "./seed.js";

const CH_URL = "http://localhost:8123";
const CH_CREDS = { user: "bench", password: "bench" };

function time(): bigint { return process.hrtime.bigint(); }
function ms(start: bigint, end: bigint): number { return Number(end - start) / 1_000_000; }

// ─── HTTP Query Helper ────────────────────────────────────────────────────────

async function chQuery(sql: string, fmt = "JSONEachRow"): Promise<unknown[]> {
  const url = new URL(CH_URL);
  url.searchParams.set("user", CH_CREDS.user);
  url.searchParams.set("password", CH_CREDS.password);
  url.searchParams.set("default_format", fmt);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: sql,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickHouse error (${res.status}): ${text}`);
  }

  if (fmt === "JSONEachRow") {
    const text = await res.text();
    return text.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
  }
  return [];
}

// ─── Schema Setup ─────────────────────────────────────────────────────────────

async function setup(): Promise<void> {
  await chQuery("DROP TABLE IF EXISTS funding_ch");

  // ReplacingMergeTree deduplicates by (slug, last_scraped_at) on merge.
  // ORDER BY is the primary key in ClickHouse — choose it carefully.
  await chQuery(`
    CREATE TABLE IF NOT EXISTS funding_ch (
      slug              String,
      title_de          String,
      title_en          Nullable(String),
      funding_type      LowCardinality(String),
      state             LowCardinality(String),
      level             LowCardinality(String),
      category          LowCardinality(String),
      description_de    String,
      is_active         UInt8,
      version           UInt16,
      content_hash      FixedString(64),
      last_scraped_at   DateTime64(3, 'UTC'),
      created_at        DateTime64(3, 'UTC')
    )
    ENGINE = ReplacingMergeTree(version)
    PARTITION BY toYYYYMM(last_scraped_at)
    ORDER BY (state, level, slug, last_scraped_at)
    SETTINGS index_granularity = 8192
  `);
}

// ─── Benchmarks ───────────────────────────────────────────────────────────────

async function benchWrite(records: SeedRecord[]): Promise<number> {
  // ClickHouse requires batch inserts — row-by-row inserts are a known anti-pattern.
  const sample = records.slice(0, 1_000);
  const rows = sample.map(r => ({
    slug: r.slug,
    title_de: r.title_de,
    title_en: r.title_en ?? "",
    funding_type: r.funding_type,
    state: r.state,
    level: r.level,
    category: r.category,
    description_de: r.description_de,
    is_active: r.is_active ? 1 : 0,
    version: r.version,
    content_hash: r.content_hash.padEnd(64, "0"),
    last_scraped_at: r.last_scraped_at.toISOString(),
    created_at: r.created_at.toISOString(),
  }));

  const body = rows.map(r => JSON.stringify(r)).join("\n");
  const url = new URL(CH_URL);
  url.searchParams.set("user", CH_CREDS.user);
  url.searchParams.set("password", CH_CREDS.password);
  url.searchParams.set("query", "INSERT INTO funding_ch FORMAT JSONEachRow");

  const start = time();
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Insert failed: ${await res.text()}`);
  return ms(start, time());
}

async function benchReadById(targetSlug: string): Promise<number> {
  const runs = 100;
  const start = time();
  for (let i = 0; i < runs; i++) {
    // ClickHouse is NOT optimized for single-row lookups — ORDER BY does not create a hash index.
    // This will be slow and shows the engine's weakness for point reads.
    await chQuery(`
      SELECT * FROM funding_ch
      WHERE slug = '${targetSlug}'
      ORDER BY last_scraped_at DESC
      LIMIT 1
    `);
  }
  return ms(start, time()) / runs;
}

async function benchFilter(): Promise<number> {
  // This is where ClickHouse shines: columnar storage + LowCardinality encoding
  // means the engine only reads the state + is_active + last_scraped_at columns
  // from disk, skipping description_de entirely.
  const runs = 50;
  const start = time();
  for (let i = 0; i < runs; i++) {
    await chQuery(`
      SELECT slug, title_de, state, last_scraped_at
      FROM funding_ch
      WHERE state = 'Bayern'
        AND is_active = 1
        AND last_scraped_at > '2024-06-01 00:00:00'
      ORDER BY last_scraped_at DESC
      LIMIT 50
    `);
  }
  return ms(start, time()) / runs;
}

async function benchFts(query: string): Promise<number> {
  // ClickHouse has no GIN-style inverted index in base CE edition.
  // Full-text is via hasToken() or ilike() — both do full column scans.
  const runs = 50;
  const start = time();
  for (let i = 0; i < runs; i++) {
    await chQuery(`
      SELECT slug, title_de
      FROM funding_ch
      WHERE hasToken(description_de, '${query}')
         OR hasToken(title_de, '${query}')
      LIMIT 20
    `);
  }
  return ms(start, time()) / runs;
}

async function benchTemporal(targetSlug: string, asOf: Date): Promise<number> {
  // ClickHouse partition pruning: PARTITION BY toYYYYMM(last_scraped_at)
  // means the engine skips entire month-partitions outside the range.
  const runs = 100;
  const asOfStr = asOf.toISOString().replace("T", " ").replace("Z", "");
  const start = time();
  for (let i = 0; i < runs; i++) {
    await chQuery(`
      SELECT * FROM funding_ch
      WHERE slug = '${targetSlug}'
        AND last_scraped_at <= '${asOfStr}'
      ORDER BY last_scraped_at DESC
      LIMIT 1
    `);
  }
  return ms(start, time()) / runs;
}

async function benchAggregation(): Promise<number> {
  // Uniquely strong use-case for ClickHouse: analytical aggregation over full table
  const runs = 20;
  const start = time();
  for (let i = 0; i < runs; i++) {
    await chQuery(`
      SELECT state, level, funding_type, count() AS cnt, avg(version) AS avg_version
      FROM funding_ch
      WHERE is_active = 1
      GROUP BY state, level, funding_type
      ORDER BY cnt DESC
    `);
  }
  return ms(start, time()) / runs;
}

async function getStorageSizeMb(): Promise<number> {
  const rows = await chQuery(`
    SELECT sum(bytes_on_disk) / 1048576.0 AS size_mb
    FROM system.parts
    WHERE table = 'funding_ch' AND active = 1
  `) as Array<{ size_mb: string }>;
  return parseFloat(rows[0]?.size_mb ?? "0");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runClickHouseBenchmark(): Promise<void> {
  console.log("\n=== ClickHouse 24.3 Benchmark ===\n");

  const allRecords = generateRecords(100_000);

  console.log("Setting up table...");
  await setup();

  console.log("Inserting 100K records in batches of 10K...");
  const batchSize = 10_000;
  for (let i = 0; i < allRecords.length; i += batchSize) {
    const chunk = allRecords.slice(i, i + batchSize);
    const rows = chunk.map(r => ({
      slug: r.slug, title_de: r.title_de, title_en: r.title_en ?? "",
      funding_type: r.funding_type, state: r.state, level: r.level,
      category: r.category, description_de: r.description_de,
      is_active: r.is_active ? 1 : 0, version: r.version,
      content_hash: r.content_hash.padEnd(64, "0"),
      last_scraped_at: r.last_scraped_at.toISOString().replace("T"," ").replace("Z",""),
      created_at: r.created_at.toISOString().replace("T"," ").replace("Z",""),
    }));
    const body = rows.map(r => JSON.stringify(r)).join("\n");
    const url = new URL(CH_URL);
    url.searchParams.set("user", CH_CREDS.user);
    url.searchParams.set("password", CH_CREDS.password);
    url.searchParams.set("query", "INSERT INTO funding_ch FORMAT JSONEachRow");
    const res = await fetch(url.toString(), { method: "POST", body });
    if (!res.ok) throw new Error(`Batch insert failed: ${await res.text()}`);
  }

  // Allow ReplacingMergeTree to settle
  await chQuery("OPTIMIZE TABLE funding_ch FINAL");

  const freshRecords = allRecords.slice(0, 1_000); // reuse for write bench
  const targetSlug = allRecords[50_000].slug;
  const asOf = new Date("2024-07-01");

  const writeDuration = await benchWrite(freshRecords);
  console.log(`  Write throughput (1K batch):       ${writeDuration.toFixed(1)} ms | ${(1000 / (writeDuration / 1000)).toFixed(0)} rec/s`);

  const readDuration = await benchReadById(targetSlug);
  console.log(`  Read by ID (avg 100) [WEAK]:       ${readDuration.toFixed(2)} ms`);

  const filterDuration = await benchFilter();
  console.log(`  Filter (state+active+date, avg 50): ${filterDuration.toFixed(2)} ms  ← columnar strength`);

  const ftsDuration = await benchFts("Digitalisierung");
  console.log(`  Full-text search (avg 50) [WEAK]:  ${ftsDuration.toFixed(2)} ms`);

  const temporalDuration = await benchTemporal(targetSlug, asOf);
  console.log(`  Temporal lookup (avg 100):         ${temporalDuration.toFixed(2)} ms`);

  const aggDuration = await benchAggregation();
  console.log(`  Aggregation (group-by, avg 20):    ${aggDuration.toFixed(2)} ms  ← best-in-class`);

  const sizeMb = await getStorageSizeMb();
  console.log(`  Storage (100K records):            ${sizeMb.toFixed(1)} MB  ← columnar compression`);
}

if (process.argv[1]?.endsWith("benchmark-clickhouse.ts")) {
  runClickHouseBenchmark().catch(console.error);
}
