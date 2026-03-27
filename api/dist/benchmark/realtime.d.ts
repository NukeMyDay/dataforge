/**
 * Benchmark: Real-time delivery latency and throughput
 *
 * Measures the pg_notify → SSE bridge under controlled conditions.
 *
 * Methodology:
 *   1. Open N SSE connections (simulated clients)
 *   2. Insert records directly into the DB using pg_notify (simulating a scrape upsert)
 *   3. Record timestamp before pg_notify → timestamp when SSE client receives the event
 *   4. Calculate p50 / p95 / p99 latency and throughput
 *
 * Requires a running PostgreSQL instance with the 0019_realtime_delivery.sql
 * migration applied.
 *
 * Usage: tsx api/src/benchmark/realtime.ts
 */
export {};
//# sourceMappingURL=realtime.d.ts.map