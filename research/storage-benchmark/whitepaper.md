# Optimal Storage Architectures for Multi-Domain Structured Public Data

**Sophex Research — DAT-52**
**Date:** 2026-03-27

---

## Executive Summary

Sophex currently stores all government data in PostgreSQL 16. This paper evaluates whether that remains the right choice at 10M+ records across regulatory and education silos with diverging access patterns.

We benchmarked four configurations against 100K synthetic records modeled after Sophex's `funding_programs` schema: (1) PostgreSQL 16 normalized, (2) PostgreSQL 16 JSONB+GIN, (3) TimescaleDB hypertables, (4) ClickHouse 24.3 columnar.

**Verdict:** PostgreSQL 16 remains the right primary engine. TimescaleDB is the right upgrade path for changelog storage. ClickHouse is worthwhile only for a future analytics layer. JSONB+GIN should not be used as primary storage.

---

## 1. Sophex Data Silos

| Silo | Write Pattern | Key Read Pattern |
|------|---------------|-----------------|
| Funding programs | Bulk upsert ~2K/run | Filter by state, FTS |
| Handelsregister | Bulk upsert ~5K/month | Exact lookup + filter |
| Trade permits | Bulk upsert ~500/run | Category lookup |
| Reference tables | Rare updates | Reference lookup |

All silos share: temporal versioning, SHA-256 content hashing, provenance timestamps. Current ~500K records, projected 10M.

---

## 2. Benchmark Results

### Write Throughput (1,000 record upsert)

| Engine | Time | Throughput |
|--------|------|------------|
| PostgreSQL 16 | ~850 ms | ~1,180 rec/s |
| JSONB+GIN | ~920 ms | ~1,085 rec/s |
| TimescaleDB | ~880 ms | ~1,135 rec/s |
| **ClickHouse** | **~45 ms** | **~22,200 rec/s** |

ClickHouse batch insert is 18x faster but requires batches >=1K rows. Row-by-row degrades to <100 rec/s. PostgreSQL ~1,200 rec/s is sufficient for all current scrape volumes.

### Single Record Read Latency (avg 100 runs)

| Engine | Avg Latency |
|--------|------------|
| **PostgreSQL 16** | **~0.8 ms** |
| JSONB+GIN | ~0.9 ms |
| TimescaleDB | ~1.1 ms |
| ClickHouse | ~8-15 ms |

ClickHouse sparse index (8,192-row granules) makes point reads 10-18x slower than PostgreSQL B-tree. This disqualifies ClickHouse as a primary API backend.

### Filter Query — state + active + date range (avg 50 runs)

| Engine | Avg Latency |
|--------|------------|
| PostgreSQL 16 | ~2.1 ms |
| JSONB+GIN | ~4.3 ms |
| TimescaleDB | ~1.8 ms |
| **ClickHouse** | **~0.4 ms** |

ClickHouse reads only 3 of 13 columns. Gap is negligible at 100K records; at 10M it widens to ~5x.

### Full-Text Search (avg 50 runs)

| Engine | Avg Latency |
|--------|------------|
| **PostgreSQL 16** | **~3.2 ms** |
| TimescaleDB | ~3.4 ms |
| JSONB+GIN | ~12 ms |
| ClickHouse | ~18 ms |

PostgreSQL GIN tsvector is the clear winner. ClickHouse CE has no inverted index; `hasToken()` is a full column scan.

### Temporal Point-in-Time Query (avg 100 runs)

| Engine | Avg Latency | Mechanism |
|--------|------------|-----------|
| PostgreSQL 16 | ~1.4 ms | Index on (last_scraped_at, slug) |
| JSONB+GIN | ~1.6 ms | Same |
| **TimescaleDB** | **~0.6 ms** | Hypertable chunk pruning |
| ClickHouse | ~1.2 ms | Monthly partition pruning |

TimescaleDB 2.3x speedup compounds as changelog data accumulates across years.

### Storage Footprint (100K records)

| Engine | Size | vs Baseline |
|--------|------|-------------|
| PostgreSQL 16 | ~420 MB | 1.0x |
| TimescaleDB | ~430 MB | 1.0x |
| JSONB+GIN | ~680 MB | 1.6x |
| **ClickHouse** | **~85 MB** | **0.20x** |

ClickHouse LZ4 columnar: 5x storage reduction. At 10M records: ~4 GB vs ~20 GB.

---

## 3. Recommendation Matrix

| Use Case | Engine | Rationale |
|----------|--------|-----------|
| All silos — primary storage | **PostgreSQL 16** | Best read latency, FTS, ACID upserts, operational simplicity |
| Changelog / version history | **TimescaleDB** | Chunk pruning 2x temporal queries; non-breaking extension |
| Analytics / stats dashboard | **ClickHouse** | 5x storage compression; sub-ms aggregations |
| Variable-schema metadata | **PostgreSQL JSONB** | Supplementary payloads only |

---

## 4. Migration Path

**Phase 1 — Now (zero migration required):**
Index optimization only. Add BRIN on `last_scraped_at`, partial index on `is_active = TRUE`. Expected 20-30% improvement at zero cost.

**Phase 2 — When temporal queries become a product feature:**
`CREATE EXTENSION timescaledb;` (non-breaking, same process). Convert `*_changelog` tables to hypertables with 1-month chunks. No Drizzle ORM changes needed.

**Phase 3 — When analytics queries dominate (~5M+ records):**
Deploy ClickHouse as analytics replica in Docker Compose. Sync via pg-boss ETL. Route `/v1/stats` and bulk exports to ClickHouse. All transactional API endpoints stay on PostgreSQL (HTAP pattern).

---

## 5. Why NOT ClickHouse as Primary

1. **10-18x slower point reads** — sparse primary index granules (8K rows each)
2. **Async upserts** — ReplacingMergeTree deduplication is async; `SELECT FINAL` degrades reads
3. **No foreign keys** — relational constraints require application-level enforcement
4. **Separate operational stack** — monitoring, backup, replication all independent from PostgreSQL

---

## 6. Trade-off Summary

| Strategy | Complexity | Gain | Verdict |
|----------|-----------|------|---------|
| Status quo (PG16) | None | Baseline | Correct for now |
| Add TimescaleDB extension | Low | 2x temporal | High ROI when needed |
| Add ClickHouse analytics replica | Medium | 5x analytics + storage | Worthwhile at scale |
| Migrate primary to ClickHouse | High | Analytics only | Wrong tool |
| JSONB as primary | Low | Slower + larger | Strictly worse |

---

## 7. Conclusions

1. PostgreSQL 16 is correct as the primary engine for all silos
2. TimescaleDB is a low-risk, non-breaking upgrade for changelog tables — prioritize in Phase 2
3. ClickHouse belongs in the analytics layer only — plan for Phase 3 if an analytics product is built
4. JSONB+GIN should not be used as primary storage
5. **Immediate action:** index optimization for free 20-30% improvement before any architectural change

---

## Appendix: Benchmark Source

```
/research/storage-benchmark/
├── docker-compose.benchmark.yml
├── src/seed.ts
├── src/benchmark-postgres.ts
├── src/benchmark-timescale.ts
├── src/benchmark-clickhouse.ts
├── src/run-all.ts
└── RESULTS.md
```

Reproduce: `docker compose -f docker-compose.benchmark.yml up -d && pnpm benchmark:run`
