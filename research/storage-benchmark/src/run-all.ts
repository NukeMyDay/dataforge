/**
 * Orchestrator: runs all four benchmark suites and emits a consolidated results table.
 *
 * Usage:
 *   cd research/storage-benchmark
 *   docker compose -f docker-compose.benchmark.yml up -d
 *   pnpm install
 *   pnpm tsx src/run-all.ts
 *
 * Each benchmark runner connects independently to its own engine.
 * Results are printed in plain-text markdown table format for easy copy-paste
 * into the whitepaper.
 */

import { runPostgresBenchmark } from "./benchmark-postgres.js";
import { runTimescaleBenchmark } from "./benchmark-timescale.js";
import { runClickHouseBenchmark } from "./benchmark-clickhouse.js";

async function main() {
  const header = `
================================================================
  Sophex Storage Architecture Benchmark — DAT-52
  Dataset: 100K synthetic funding_programs records
  Dimensions: write 1K, read-by-id, filter, FTS, temporal, size
================================================================
`;
  console.log(header);

  await runPostgresBenchmark();
  await runTimescaleBenchmark();
  await runClickHouseBenchmark();

  console.log(`
================================================================
  DONE — see individual engine sections above for raw numbers.
  Copy results into /research/storage-benchmark/RESULTS.md
================================================================
`);
}

main().catch(err => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
