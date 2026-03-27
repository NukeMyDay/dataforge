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
import postgres from "postgres";
const DB_URL = process.env["DATABASE_URL"] ?? "postgres://dataforge:dataforge@localhost:5432/dataforge";
const API_BASE = process.env["API_BASE_URL"] ?? "http://localhost:3000";
// ─── Config ──────────────────────────────────────────────────────────────────
const CONCURRENT_CLIENTS = 50;
const EVENTS_PER_CLIENT = 20; // total events we fire into pg_notify
const TOTAL_EVENTS = 200;
async function connectSseClient(url) {
    const received = [];
    // Use Node.js native fetch + ReadableStream to consume SSE
    const abortController = new AbortController();
    const res = await fetch(url, { signal: abortController.signal });
    if (!res.ok || !res.body) {
        throw new Error(`SSE connect failed: ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    // Async reader — populates `received` with timestamps of arrival
    (async () => {
        let buffer = "";
        while (true) {
            try {
                const { done, value } = await reader.read();
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        received.push(Date.now());
                    }
                }
            }
            catch {
                break; // aborted
            }
        }
    })();
    return {
        received,
        close: () => abortController.abort(),
    };
}
function percentile(sorted, p) {
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)] ?? 0;
}
async function run() {
    console.log("=== Sophex Real-time Delivery Benchmark ===");
    console.log(`Clients: ${CONCURRENT_CLIENTS}  Events: ${TOTAL_EVENTS}`);
    console.log(`DB: ${DB_URL.replace(/:([^@]+)@/, ":***@")}`);
    console.log(`API: ${API_BASE}\n`);
    // Step 1 — Connect all SSE clients
    console.log(`Connecting ${CONCURRENT_CLIENTS} SSE clients…`);
    const connectStart = Date.now();
    const clients = await Promise.all(Array.from({ length: CONCURRENT_CLIENTS }, () => connectSseClient(`${API_BASE}/v1/stream/changes`)));
    // Allow connections to settle before firing events
    await new Promise((r) => setTimeout(r, 500));
    console.log(`All clients connected in ${Date.now() - connectStart}ms`);
    // Step 2 — Fire events via pg_notify (simulates a scrape writing a new content_hash)
    const sql = postgres(DB_URL, { max: 1 });
    const sendTimestamps = [];
    console.log(`\nFiring ${TOTAL_EVENTS} pg_notify events…`);
    const fireStart = Date.now();
    for (let i = 0; i < TOTAL_EVENTS; i++) {
        const payload = JSON.stringify({
            silo: "funding_programs",
            op: "UPDATE",
            id: i + 1,
            content_hash: `bench_${i}_${Date.now()}`,
            ts: Date.now() / 1000,
        });
        sendTimestamps.push(Date.now());
        await sql `SELECT pg_notify('record_changes', ${payload})`;
        // Small gap to avoid overloading; real scrapes are not burst-fire
        if (i % 10 === 9) {
            await new Promise((r) => setTimeout(r, 50));
        }
    }
    const fireEnd = Date.now();
    const fireDurationSec = (fireEnd - fireStart) / 1000;
    // Step 3 — Wait for events to propagate
    await new Promise((r) => setTimeout(r, 1_000));
    // Step 4 — Collect results
    clients.forEach((c) => c.close());
    await sql.end();
    // Match send timestamps to receive timestamps per client (one-to-one, order preserved)
    const allLatencies = [];
    let totalReceived = 0;
    let totalTimeouts = 0;
    for (const client of clients) {
        const n = Math.min(client.received.length, sendTimestamps.length);
        totalReceived += client.received.length;
        for (let i = 0; i < n; i++) {
            // latency = receipt time - send time for the i-th event
            const lat = (client.received[i] ?? 0) - (sendTimestamps[i] ?? 0);
            if (lat >= 0 && lat < 10_000) {
                allLatencies.push(lat);
            }
        }
        const missed = TOTAL_EVENTS - client.received.length;
        if (missed > 0)
            totalTimeouts += missed;
    }
    allLatencies.sort((a, b) => a - b);
    const throughput = TOTAL_EVENTS / fireDurationSec;
    const result = {
        latencies: allLatencies,
        timeouts: totalTimeouts,
        throughputEventsPerSec: throughput,
    };
    // ─── Report ────────────────────────────────────────────────────────────────
    console.log("\n=== Results ===");
    console.log(`Total events fired:    ${TOTAL_EVENTS}`);
    console.log(`Total clients:         ${CONCURRENT_CLIENTS}`);
    console.log(`Events received total: ${totalReceived} / ${TOTAL_EVENTS * CONCURRENT_CLIENTS} expected`);
    console.log(`Missed events:         ${result.timeouts}`);
    console.log(`\nLatency (ms) — pg_notify write → SSE client receipt:`);
    if (allLatencies.length > 0) {
        console.log(`  min:  ${allLatencies[0]}ms`);
        console.log(`  p50:  ${percentile(allLatencies, 50)}ms`);
        console.log(`  p95:  ${percentile(allLatencies, 95)}ms`);
        console.log(`  p99:  ${percentile(allLatencies, 99)}ms`);
        console.log(`  max:  ${allLatencies[allLatencies.length - 1]}ms`);
    }
    else {
        console.log("  (no latency samples — is the API running and DB migrated?)");
    }
    console.log(`\nThroughput: ${result.throughputEventsPerSec.toFixed(1)} events/sec`);
    console.log(`  (${EVENTS_PER_CLIENT} events × ${CONCURRENT_CLIENTS} clients scenario)`);
    console.log("\nDone.");
}
run().catch((err) => {
    console.error("Benchmark failed:", err);
    process.exit(1);
});
//# sourceMappingURL=realtime.js.map