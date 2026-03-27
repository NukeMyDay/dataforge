/**
 * Benchmark: PostgreSQL 16 — Baseline + JSONB+GIN variant
 *
 * Tests two configurations:
 *   A) Standard normalized table with B-tree + GIN (tsvector) indexes
 *   B) JSONB column + GIN index (document-store style within PostgreSQL)
 *
 * Both run against the same postgres service in docker-compose.benchmark.yml.
 */

import { Pool } from "pg";
import { generateRecords, type SeedRecord } from "./seed.js";

const SEED_SIZE = 100_000;
const BATCH_SIZE = 1_000;

const pool = new Pool({
  host: "localhost",
  port: 5433,
  user: "bench",
  password: "bench",
  database: "bench_postgres",
  max: 5,
});

// ─── Schema Setup ─────────────────────────────────────────────────────────────

async function setupStandard(): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS funding_standard CASCADE;
    CREATE TABLE funding_standard (
      id              SERIAL PRIMARY KEY,
      slug            VARCHAR(512) NOT NULL UNIQUE,
      title_de        TEXT NOT NULL,
      title_en        TEXT,
      funding_type    TEXT,
      funding_area    TEXT,
      state           VARCHAR(64),
      level           VARCHAR(32),
      category        VARCHAR(128),
      description_de  TEXT,
      legal_requirements_de TEXT,
      is_active       BOOLEAN NOT NULL DEFAULT TRUE,
      version         INTEGER NOT NULL DEFAULT 1,
      content_hash    VARCHAR(64),
      last_scraped_at TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    -- Covering index for common filter patterns
    CREATE INDEX idx_funding_state_level ON funding_standard(state, level);
    CREATE INDEX idx_funding_category    ON funding_standard(category);
    CREATE INDEX idx_funding_scraped     ON funding_standard(last_scraped_at);
    CREATE INDEX idx_funding_active      ON funding_standard(is_active) WHERE is_active = TRUE;

    -- Full-text search index over title + description
    CREATE INDEX idx_funding_fts ON funding_standard
      USING GIN(to_tsvector('german', coalesce(title_de,'') || ' ' || coalesce(description_de,'')));
  `);
}

async function setupJsonb(): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS funding_jsonb CASCADE;
    CREATE TABLE funding_jsonb (
      id      SERIAL PRIMARY KEY,
      slug    VARCHAR(512) NOT NULL UNIQUE,
      payload JSONB NOT NULL
    );

    -- GIN index over the entire JSONB payload
    CREATE INDEX idx_jsonb_payload ON funding_jsonb USING GIN(payload);
    -- Extracted fields for common equality filters
    CREATE INDEX idx_jsonb_state ON funding_jsonb ((payload->>'state'));
    CREATE INDEX idx_jsonb_level ON funding_jsonb ((payload->>'level'));
  `);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function time(): bigint { return process.hrtime.bigint(); }
function ms(start: bigint, end: bigint): number { return Number(end - start) / 1_000_000; }

// ─── Standard Table Benchmarks ────────────────────────────────────────────────

async function benchWriteStandard(records: SeedRecord[]): Promise<number> {
  const sample = records.slice(0, BATCH_SIZE);
  const start = time();
  for (const r of sample) {
    await pool.query(
      `INSERT INTO funding_standard
         (slug, title_de, title_en, funding_type, funding_area, state, level, category,
          description_de, legal_requirements_de, is_active, version, content_hash, last_scraped_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (slug) DO UPDATE SET
         title_de=EXCLUDED.title_de, state=EXCLUDED.state, version=EXCLUDED.version,
         content_hash=EXCLUDED.content_hash, last_scraped_at=EXCLUDED.last_scraped_at,
         updated_at=NOW()`,
      [r.slug, r.title_de, r.title_en, r.funding_type, r.funding_area,
       r.state, r.level, r.category, r.description_de, r.legal_requirements_de,
       r.is_active, r.version, r.content_hash, r.last_scraped_at, r.updated_at]
    );
  }
  return ms(start, time());
}

async function benchReadByIdStandard(targetSlug: string): Promise<number> {
  const runs = 100;
  const start = time();
  for (let i = 0; i < runs; i++) {
    await pool.query("SELECT * FROM funding_standard WHERE slug = $1", [targetSlug]);
  }
  return ms(start, time()) / runs;
}

async function benchFilterStandard(): Promise<number> {
  const runs = 50;
  const start = time();
  for (let i = 0; i < runs; i++) {
    await pool.query(`
      SELECT id, slug, title_de, state, level, last_scraped_at
      FROM funding_standard
      WHERE state = 'Bayern' AND is_active = TRUE
        AND last_scraped_at > '2024-06-01'
      ORDER BY last_scraped_at DESC
      LIMIT 50
    `);
  }
  return ms(start, time()) / runs;
}

async function benchFtsStandard(query: string): Promise<number> {
  const runs = 50;
  const start = time();
  for (let i = 0; i < runs; i++) {
    await pool.query(`
      SELECT id, slug, title_de,
             ts_rank(to_tsvector('german', coalesce(title_de,'') || ' ' || coalesce(description_de,'')),
                     plainto_tsquery('german', $1)) AS rank
      FROM funding_standard
      WHERE to_tsvector('german', coalesce(title_de,'') || ' ' || coalesce(description_de,''))
            @@ plainto_tsquery('german', $1)
      ORDER BY rank DESC
      LIMIT 20
    `, [query]);
  }
  return ms(start, time()) / runs;
}

// Temporal query: what did record X look like as of a given date?
// Strategy: version column + updated_at — requires a changelog table in real prod.
// Here we simulate with a point-in-time filter on last_scraped_at.
async function benchTemporalStandard(asOf: Date): Promise<number> {
  const runs = 50;
  const start = time();
  for (let i = 0; i < runs; i++) {
    await pool.query(`
      SELECT * FROM funding_standard
      WHERE last_scraped_at <= $1
      ORDER BY last_scraped_at DESC
      LIMIT 1
    `, [asOf]);
  }
  return ms(start, time()) / runs;
}

// ─── JSONB Table Benchmarks ───────────────────────────────────────────────────

async function benchWriteJsonb(records: SeedRecord[]): Promise<number> {
  const sample = records.slice(0, BATCH_SIZE);
  const start = time();
  for (const r of sample) {
    await pool.query(
      `INSERT INTO funding_jsonb (slug, payload) VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET payload = EXCLUDED.payload`,
      [r.slug, JSON.stringify(r)]
    );
  }
  return ms(start, time());
}

async function benchReadByIdJsonb(targetSlug: string): Promise<number> {
  const runs = 100;
  const start = time();
  for (let i = 0; i < runs; i++) {
    await pool.query("SELECT payload FROM funding_jsonb WHERE slug = $1", [targetSlug]);
  }
  return ms(start, time()) / runs;
}

async function benchFilterJsonb(): Promise<number> {
  const runs = 50;
  const start = time();
  for (let i = 0; i < runs; i++) {
    await pool.query(`
      SELECT slug, payload->>'title_de' AS title_de,
             payload->>'state' AS state,
             payload->>'last_scraped_at' AS scraped
      FROM funding_jsonb
      WHERE payload->>'state' = 'Bayern'
        AND (payload->>'is_active')::boolean = TRUE
      LIMIT 50
    `);
  }
  return ms(start, time()) / runs;
}

async function benchFtsJsonb(query: string): Promise<number> {
  const runs = 50;
  const start = time();
  for (let i = 0; i < runs; i++) {
    // JSONB GIN index supports @> operator and jsonpath; FTS needs cast
    await pool.query(`
      SELECT slug, payload->>'title_de' AS title_de
      FROM funding_jsonb
      WHERE payload @@ ($1::text)::jsonpath
      LIMIT 20
    `, [`$.description_de like_regex "${query}" flag "i"`]);
  }
  return ms(start, time()) / runs;
}

// ─── Storage footprint ────────────────────────────────────────────────────────

async function getStorageSize(): Promise<{ standard_mb: number; jsonb_mb: number }> {
  const res = await pool.query(`
    SELECT
      pg_total_relation_size('funding_standard') / 1048576.0 AS standard_mb,
      pg_total_relation_size('funding_jsonb')    / 1048576.0 AS jsonb_mb
  `);
  return res.rows[0];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function runPostgresBenchmark(): Promise<void> {
  console.log("\n=== PostgreSQL 16 Benchmark ===\n");

  console.log("Generating seed data...");
  const allRecords = generateRecords(SEED_SIZE);

  console.log("Setting up schemas...");
  await setupStandard();
  await setupJsonb();

  // Bulk insert all records first (not timed — setup phase)
  console.log(`Inserting ${SEED_SIZE} records into standard table...`);
  for (let i = 0; i < SEED_SIZE; i += BATCH_SIZE) {
    const chunk = allRecords.slice(i, i + BATCH_SIZE);
    await pool.query(`
      INSERT INTO funding_standard
        (slug, title_de, title_en, funding_type, funding_area, state, level, category,
         description_de, legal_requirements_de, is_active, version, content_hash, last_scraped_at, updated_at)
      SELECT * FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
        $6::text[], $7::text[], $8::text[], $9::text[], $10::text[],
        $11::bool[], $12::int[], $13::text[], $14::timestamptz[], $15::timestamptz[]
      )
      ON CONFLICT (slug) DO NOTHING
    `, [
      chunk.map(r => r.slug),       chunk.map(r => r.title_de),    chunk.map(r => r.title_en),
      chunk.map(r => r.funding_type), chunk.map(r => r.funding_area), chunk.map(r => r.state),
      chunk.map(r => r.level),       chunk.map(r => r.category),    chunk.map(r => r.description_de),
      chunk.map(r => r.legal_requirements_de), chunk.map(r => r.is_active), chunk.map(r => r.version),
      chunk.map(r => r.content_hash), chunk.map(r => r.last_scraped_at), chunk.map(r => r.updated_at),
    ]);
  }

  console.log(`Inserting ${SEED_SIZE} records into JSONB table...`);
  for (let i = 0; i < SEED_SIZE; i += BATCH_SIZE) {
    const chunk = allRecords.slice(i, i + BATCH_SIZE);
    const values = chunk.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(",");
    const params = chunk.flatMap(r => [r.slug, JSON.stringify(r)]);
    await pool.query(
      `INSERT INTO funding_jsonb (slug, payload) VALUES ${values} ON CONFLICT DO NOTHING`,
      params
    );
  }

  const targetSlug = allRecords[Math.floor(SEED_SIZE / 2)].slug;
  const ftsQuery = "Digitalisierung Förderung";
  const asOf = new Date("2024-09-01");
  const freshRecords = generateRecords(BATCH_SIZE, SEED_SIZE); // new batch for upsert test

  console.log("\n--- Standard Table ---");
  const writeStd = await benchWriteStandard(freshRecords);
  console.log(`  Write throughput (1K upserts):     ${writeStd.toFixed(1)} ms total | ${(BATCH_SIZE / (writeStd / 1000)).toFixed(0)} rec/s`);

  const readStd = await benchReadByIdStandard(targetSlug);
  console.log(`  Read by ID (avg 100 runs):         ${readStd.toFixed(2)} ms`);

  const filterStd = await benchFilterStandard();
  console.log(`  Filter (state+active+date, avg 50): ${filterStd.toFixed(2)} ms`);

  const ftsStd = await benchFtsStandard(ftsQuery);
  console.log(`  Full-text search (avg 50):         ${ftsStd.toFixed(2)} ms`);

  const temporalStd = await benchTemporalStandard(asOf);
  console.log(`  Temporal (point-in-time, avg 50):  ${temporalStd.toFixed(2)} ms`);

  console.log("\n--- JSONB + GIN Table ---");
  const writeJsonb = await benchWriteJsonb(freshRecords);
  console.log(`  Write throughput (1K upserts):     ${writeJsonb.toFixed(1)} ms total | ${(BATCH_SIZE / (writeJsonb / 1000)).toFixed(0)} rec/s`);

  const readJsonb = await benchReadByIdJsonb(targetSlug);
  console.log(`  Read by ID (avg 100 runs):         ${readJsonb.toFixed(2)} ms`);

  const filterJsonb = await benchFilterJsonb();
  console.log(`  Filter (state+active, avg 50):     ${filterJsonb.toFixed(2)} ms`);

  const ftsJsonb = await benchFtsJsonb("Digitalisierung");
  console.log(`  Full-text search (avg 50):         ${ftsJsonb.toFixed(2)} ms`);

  const sizes = await getStorageSize();
  console.log("\n--- Storage Footprint (100K records) ---");
  console.log(`  Standard table + indexes:  ${sizes.standard_mb?.toFixed(1)} MB`);
  console.log(`  JSONB table + GIN index:   ${sizes.jsonb_mb?.toFixed(1)} MB`);

  await pool.end();
}

if (process.argv[1]?.endsWith("benchmark-postgres.ts")) {
  runPostgresBenchmark().catch(console.error);
}
