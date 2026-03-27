/**
 * Benchmark: TimescaleDB (PostgreSQL 16 + Timescale extension)
 *
 * Uses hypertables partitioned by last_scraped_at to test whether time-series
 * partitioning gives measurable gains for Sophex's versioned data access patterns.
 *
 * Key hypothesis: temporal queries ("give me record X as of date Y") should be
 * significantly faster when the engine can skip entire time-chunk partitions.
 *
 * Runs against the timescale service in docker-compose.benchmark.yml (port 5434).
 */

import { Pool } from "pg";
import { generateRecords, type SeedRecord } from "./seed.js";

const SEED_SIZE = 100_000;
const BATCH_SIZE = 1_000;

const pool = new Pool({
  host: "localhost",
  port: 5434,
  user: "bench",
  password: "bench",
  database: "bench_timescale",
  max: 5,
});

function time(): bigint { return process.hrtime.bigint(); }
function ms(start: bigint, end: bigint): number { return Number(end - start) / 1_000_000; }

// ─── Schema Setup ─────────────────────────────────────────────────────────────

async function setup(): Promise<void> {
  await pool.query("CREATE EXTENSION IF NOT EXISTS timescaledb;");

  await pool.query(`
    DROP TABLE IF EXISTS funding_ts CASCADE;
    CREATE TABLE funding_ts (
      id              SERIAL,
      slug            VARCHAR(512) NOT NULL,
      title_de        TEXT NOT NULL,
      title_en        TEXT,
      funding_type    TEXT,
      state           VARCHAR(64),
      level           VARCHAR(32),
      category        VARCHAR(128),
      description_de  TEXT,
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      version         INTEGER NOT NULL DEFAULT 1,
      content_hash    VARCHAR(64),
      -- Hypertable partition key — must be included in all inserts
      last_scraped_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (id, last_scraped_at)
    );
  `);

  // Convert to hypertable: 1-month chunks over last_scraped_at
  await pool.query(`
    SELECT create_hypertable('funding_ts', 'last_scraped_at',
      chunk_time_interval => INTERVAL '1 month',
      if_not_exists => TRUE
    );
  `);

  // Secondary index for slug lookups (most common API access pattern)
  await pool.query(`
    CREATE INDEX idx_ts_slug    ON funding_ts(slug, last_scraped_at DESC);
    CREATE INDEX idx_ts_state   ON funding_ts(state, last_scraped_at DESC);
    CREATE INDEX idx_ts_fts     ON funding_ts
      USING GIN(to_tsvector('german', coalesce(title_de,'') || ' ' || coalesce(description_de,'')));
  `);
}

// ─── Benchmarks ───────────────────────────────────────────────────────────────

async function benchWrite(records: SeedRecord[]): Promise<number> {
  const sample = records.slice(0, BATCH_SIZE);
  const start = time();
  // TimescaleDB: inserts by time range; upsert requires unique constraint on (slug, last_scraped_at)
  for (const r of sample) {
    await pool.query(`
      INSERT INTO funding_ts
        (slug, title_de, title_en, funding_type, state, level, category,
         description_de, is_active, version, content_hash, last_scraped_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id, last_scraped_at) DO NOTHING
    `, [r.slug, r.title_de, r.title_en, r.funding_type, r.state, r.level,
        r.category, r.description_de, r.is_active, r.version, r.content_hash, r.last_scraped_at]);
  }
  return ms(start, time());
}

async function benchReadById(targetSlug: string): Promise<number> {
  const runs = 100;
  const start = time();
  for (let i = 0; i < runs; i++) {
    // Latest version of a record — common API pattern
    await pool.query(`
      SELECT * FROM funding_ts
      WHERE slug = $1
      ORDER BY last_scraped_at DESC
      LIMIT 1
    `, [targetSlug]);
  }
  return ms(start, time()) / runs;
}

async function benchFilter(): Promise<number> {
  const runs = 50;
  const start = time();
  for (let i = 0; i < runs; i++) {
    await pool.query(`
      SELECT DISTINCT ON (slug) slug, title_de, state, last_scraped_at
      FROM funding_ts
      WHERE state = 'Bayern'
        AND last_scraped_at > '2024-06-01'
      ORDER BY slug, last_scraped_at DESC
      LIMIT 50
    `);
  }
  return ms(start, time()) / runs;
}

async function benchFts(query: string): Promise<number> {
  const runs = 50;
  const start = time();
  for (let i = 0; i < runs; i++) {
    await pool.query(`
      SELECT slug, title_de, last_scraped_at
      FROM funding_ts
      WHERE to_tsvector('german', coalesce(title_de,'') || ' ' || coalesce(description_de,''))
            @@ plainto_tsquery('german', $1)
      ORDER BY last_scraped_at DESC
      LIMIT 20
    `, [query]);
  }
  return ms(start, time()) / runs;
}

/**
 * True temporal query: "what was the state of record X at time T?"
 * TimescaleDB's chunk pruning makes this the engine's key advantage —
 * the planner skips all chunks outside the [0, asOf] range.
 */
async function benchTemporal(targetSlug: string, asOf: Date): Promise<number> {
  const runs = 100;
  const start = time();
  for (let i = 0; i < runs; i++) {
    await pool.query(`
      SELECT * FROM funding_ts
      WHERE slug = $1
        AND last_scraped_at <= $2
      ORDER BY last_scraped_at DESC
      LIMIT 1
    `, [targetSlug, asOf]);
  }
  return ms(start, time()) / runs;
}

async function getStorageSizeMb(): Promise<number> {
  const res = await pool.query(`
    SELECT pg_total_relation_size('funding_ts') / 1048576.0 AS size_mb
  `);
  return parseFloat(res.rows[0].size_mb);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runTimescaleBenchmark(): Promise<void> {
  console.log("\n=== TimescaleDB Benchmark ===\n");

  const allRecords = generateRecords(SEED_SIZE);

  console.log("Setting up hypertable...");
  await setup();

  console.log(`Inserting ${SEED_SIZE} records...`);
  for (let i = 0; i < SEED_SIZE; i += BATCH_SIZE) {
    const chunk = allRecords.slice(i, i + BATCH_SIZE);
    // Batch insert via unnest for setup speed
    await pool.query(`
      INSERT INTO funding_ts
        (slug, title_de, title_en, funding_type, state, level, category,
         description_de, is_active, version, content_hash, last_scraped_at)
      SELECT * FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::text[], $8::text[], $9::bool[], $10::int[],
        $11::text[], $12::timestamptz[]
      )
    `, [
      chunk.map(r => r.slug),        chunk.map(r => r.title_de),
      chunk.map(r => r.title_en),    chunk.map(r => r.funding_type),
      chunk.map(r => r.state),       chunk.map(r => r.level),
      chunk.map(r => r.category),    chunk.map(r => r.description_de),
      chunk.map(r => r.is_active),   chunk.map(r => r.version),
      chunk.map(r => r.content_hash), chunk.map(r => r.last_scraped_at),
    ]);
  }

  const freshRecords = generateRecords(BATCH_SIZE, SEED_SIZE);
  const targetSlug = allRecords[50_000].slug;
  const asOf = new Date("2024-07-01");

  const writeDuration = await benchWrite(freshRecords);
  console.log(`  Write throughput (1K inserts):     ${writeDuration.toFixed(1)} ms | ${(BATCH_SIZE / (writeDuration / 1000)).toFixed(0)} rec/s`);

  const readDuration = await benchReadById(targetSlug);
  console.log(`  Read latest by slug (avg 100):     ${readDuration.toFixed(2)} ms`);

  const filterDuration = await benchFilter();
  console.log(`  Filter (state+date, avg 50):       ${filterDuration.toFixed(2)} ms`);

  const ftsDuration = await benchFts("Digitalisierung Förderung");
  console.log(`  Full-text search (avg 50):         ${ftsDuration.toFixed(2)} ms`);

  const temporalDuration = await benchTemporal(targetSlug, asOf);
  console.log(`  Temporal lookup (avg 100):         ${temporalDuration.toFixed(2)} ms  ← chunk pruning benefit`);

  const sizeMb = await getStorageSizeMb();
  console.log(`  Storage (100K records + indexes):  ${sizeMb.toFixed(1)} MB`);

  await pool.end();
}

if (process.argv[1]?.endsWith("benchmark-timescale.ts")) {
  runTimescaleBenchmark().catch(console.error);
}
