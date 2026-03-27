# Real-time Data Delivery — Streaming Government Data Changes

**Sophex Research Series | DAT-55 | March 2026**
*Research Engineer, Sophex Data Platform*

---

## Abstract

Government and regulatory data is inherently slow-moving — scraped at weekly or daily intervals — but consumers increasingly expect to know *when* data changes rather than discovering it on the next poll. This paper evaluates four architectures for real-time change notification on top of a PostgreSQL-backed structured data platform: Server-Sent Events (SSE) bridged via `pg_notify`, webhook push using `pg-boss` job queues, full-duplex WebSocket, and baseline HTTP polling. We benchmark each approach against latency, throughput, operational complexity, and infrastructure cost. We find that a **pg_notify → SSE bridge** delivers sub-50ms p99 latency at zero additional infrastructure cost, while a **pg-boss webhook system** provides durable, retry-capable at-least-once delivery for integration partners. We recommend deploying both in tandem.

---

## 1. Problem Statement

The Sophex platform aggregates regulatory data across six domains from German government sources: funding programs, legal entity forms, trade registration, social insurance, tax obligations, and permits. Scrapers run on weekly schedules, but individual records change at unpredictable intervals.

The current model requires API consumers to poll `GET /v1/funding?updated_since=…` to discover changes. At scale, this creates:

- **Sustained read load** even when nothing has changed
- **Discovery latency** proportional to polling interval (minutes to days)
- **Unnecessary bandwidth** — full result sets transferred on every poll

The research question: *When a scrape run detects a changed record (content-hash diff), how can downstream consumers be notified with minimal latency, operational complexity, and infrastructure cost?*

---

## 2. Architecture Overview

### 2.1 Data Change Detection

All Sophex silo tables store a `content_hash` column (SHA-256 of the canonical record JSON). Scrapers compute the hash of newly-fetched content and upsert only when the hash differs. This is the natural trigger point for change notifications.

### 2.2 pg_notify as the Event Bus

PostgreSQL's `LISTEN/NOTIFY` mechanism is an underutilized feature with compelling properties for this use case:

- **In-transaction delivery**: `NOTIFY` fires after the upsert commits — no phantom notifications
- **Zero additional infrastructure**: no Redis, no Kafka, no message broker
- **Reliable ordering within a session**: NOTIFY is processed in commit order
- **Payload capacity**: up to 8,000 bytes per notification — sufficient for our 150-byte change events

A trigger function fires `pg_notify('record_changes', payload)` on each silo table when `content_hash` changes:

```sql
CREATE OR REPLACE FUNCTION notify_record_change()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR (TG_OP = 'UPDATE' AND OLD.content_hash IS DISTINCT FROM NEW.content_hash) THEN
    PERFORM pg_notify('record_changes', json_build_object(
      'silo', TG_TABLE_NAME, 'op', TG_OP,
      'id', NEW.id, 'content_hash', NEW.content_hash,
      'ts', extract(epoch from clock_timestamp())
    )::text);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

This trigger is installed on all 11 silo tables.

---

## 3. Approach 1: pg_notify → SSE Bridge

### 3.1 Architecture

```
Scraper Upsert → PostgreSQL Trigger → pg_notify('record_changes')
                                              ↓
                              Node.js LISTEN connection (1 per process)
                                              ↓
                              Fan-out to N connected SSE clients
                              GET /v1/stream/changes?silo=funding_programs
```

Server-Sent Events (SSE) is an HTTP/1.1 standard (`text/event-stream`) that keeps a long-lived HTTP connection open and pushes newline-delimited `data:` events. Key properties:

- **Unidirectional** (server → client) — matches our use case
- **Works through HTTP proxies** — unlike WebSocket, no special proxy config
- **Browser native** — `EventSource` API handles reconnect automatically

### 3.2 Implementation

The API maintains a module-level `Set<SseClient>` of connected clients. A single shared `postgres` LISTEN connection is initialized on first client connect and fans out notifications to all clients matching the optional `silo` filter.

A 25-second heartbeat comment keeps the connection alive through idle-timeout proxies.

### 3.3 Benchmark Results

| Metric | Value |
|--------|-------|
| p50 latency (write → client) | **8 ms** |
| p95 latency | **23 ms** |
| p99 latency | **47 ms** |
| Concurrent clients (stable) | **500+** |
| Memory per 100 clients | ~24 MB |
| Throughput (ev/sec) | **3,200** |

Latency is dominated by Node.js event loop overhead (~2–5ms). Fan-out to 50 clients adds < 1ms.

### 3.4 Limitations

1. **No replay on reconnect**: clients miss events during disconnect gaps. Production needs a replay buffer.
2. **Single-process fan-out**: horizontal scaling requires Redis SUBSCRIBE or sticky load-balancing.
3. **pg_notify is not durable**: if PostgreSQL crashes mid-notification, the message is lost.

---

## 4. Approach 2: Webhooks via pg-boss

### 4.1 Architecture

```
Scraper Upsert → pg_notify → Node.js listener → pg-boss job enqueue
                                                          ↓
                                              pg-boss worker polls every 500ms
                                                          ↓
                                              HTTP POST to registered callback URL
                                              X-DataForge-Signature: sha256=<hmac>
```

### 4.2 Benchmark Results

| Metric | Value |
|--------|-------|
| p50 latency (write → delivery) | **520 ms** |
| p95 latency | **1,840 ms** |
| p99 latency | **2,200 ms** |
| Delivery guarantee | **at-least-once** |
| Outbound throughput | **80 POST/sec** per worker |

Latency is dominated by the pg-boss polling interval. Lowering to 100ms reduces p50 to ~120ms at 5× DB polling cost.

---

## 5. Approach 3: WebSocket (Evaluated, Not Implemented)

WebSocket provides full-duplex communication but requires WS-aware load balancer configuration and connection state management. Since Sophex change notifications are purely server-to-client, WebSocket's bidirectional capability is unnecessary. **Decision: not implemented.**

---

## 6. Approach 4: HTTP Polling (Baseline)

| Metric | Value |
|--------|-------|
| p50 discovery latency | **2,500 ms** |
| DB load (100 clients, 5s interval) | **20 QPS constant** |

SSE eliminates this constant DB load — connected clients consume zero queries until a change fires.

---

## 7. Comparison Matrix

| Approach | p50 Latency | Complexity | Infra Cost | Delivery | Best For |
|----------|-------------|------------|------------|----------|----------|
| **pg_notify → SSE** | **8 ms** | Low | Zero | Best-effort | Live dashboards, dev tools |
| **Webhook (pg-boss)** | **520 ms** | Medium | Zero | At-least-once | Integrations, CI/CD |
| WebSocket | ~5 ms | High | Proxy config | Best-effort | Bidirectional (not needed) |
| HTTP Polling | 2,500 ms | Minimal | High (constant QPS) | None | Legacy clients |

---

## 8. Production Integration Roadmap

### Phase 1 (Current PoC — DAT-55)
- ✅ SSE endpoint `GET /v1/stream/changes`
- ✅ Webhook registration `POST /v1/webhooks` with HMAC verification
- ✅ pg_notify triggers on all 11 silo tables
- ✅ pg-boss delivery with retry and delivery log

### Phase 2 (Next sprint)
- **Replay buffer**: Store last 1,000 change events in a `change_events` table with `Last-Event-ID` support
- **Multi-process fan-out**: Redis SUBSCRIBE for horizontal scalability
- **Webhook dead-letter queue**: Persistent storage for permanently-failed deliveries

### Phase 3 (Production hardening)
- **Per-key SSE connection limits** (default: 5 concurrent streams per API key)
- **pg-boss polling at 500ms** (configurable via env)
- **Streaming exports**: SSE for large dataset delivery without pagination

---

## 9. Conclusion

For a PostgreSQL-first platform like Sophex, the **pg_notify → SSE bridge** is the optimal real-time delivery primitive: sub-50ms p99 latency, zero additional infrastructure, and linear client scaling to 500+ connections — all in ~80 lines of TypeScript.

For integration partners requiring durable delivery, **webhooks via pg-boss** complement SSE with at-least-once guarantees and HMAC-authenticated payloads.

The combination covers all identified Sophex consumer patterns without introducing new infrastructure components.

---

## Appendix: Key Files

| File | Purpose |
|------|---------|
| `api/src/routes/stream.ts` | SSE endpoint + pg_notify listener |
| `api/src/routes/webhooks.ts` | Webhook CRUD + delivery helper |
| `db/migrations/0019_realtime_delivery.sql` | Trigger function + webhook tables |
| `db/src/schema/webhooks.ts` | Drizzle ORM schema |
| `api/src/benchmark/realtime.ts` | Live benchmark script |
| `research/realtime-delivery/RESULTS.md` | Benchmark results |
