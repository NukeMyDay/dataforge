import { Hono } from "hono";
import { createListenClient } from "../db.js";

export const streamRouter = new Hono();

// ─── SSE client registry ───────────────────────────────────────────────────────

interface SseClient {
  // null = subscribed to all silos
  silos: Set<string> | null;
  send: (data: string) => void;
}

const clients = new Set<SseClient>();
let listenerStarted = false;

// Fan out a pg_notify payload to all connected SSE clients that match the silo filter
function fanOut(payload: string): void {
  let event: { silo?: string } | null = null;
  try {
    event = JSON.parse(payload) as { silo?: string };
  } catch {
    return; // malformed payload — skip
  }

  const silo = event?.silo ?? "";

  for (const client of clients) {
    if (client.silos === null || client.silos.has(silo)) {
      client.send(`data: ${payload}\n\n`);
    }
  }
}

// Start the single shared pg LISTEN connection — called once at first SSE request
function ensureListener(): void {
  if (listenerStarted) return;
  listenerStarted = true;

  const listenSql = createListenClient();

  // postgres package's listen() keeps a reserved connection open.
  // The promise never resolves (it's long-lived); we attach error logging.
  listenSql.listen("record_changes", fanOut).catch((err: unknown) => {
    console.error("[stream] pg_notify listener failed:", err);
    listenerStarted = false; // allow reconnect on next request
  });
}

// ─── GET /v1/stream/changes ───────────────────────────────────────────────────
// Server-Sent Events stream. Emits a "record_changes" event whenever a silo
// record is inserted or updated with a new content_hash.
//
// Query params:
//   silo  — comma-separated silo table names to filter on
//            (e.g. "funding_programs,permits")
//            Omit for all silos.
//
// Event format:
//   data: {"silo":"funding_programs","op":"INSERT","id":42,"content_hash":"abc…","ts":1711500000.123}
//
// Clients should handle reconnection (EventSource does this automatically).
streamRouter.get("/changes", (c) => {
  ensureListener();

  const siloParam = c.req.query("silo");
  const silos: Set<string> | null = siloParam
    ? new Set(siloParam.split(",").map((s) => s.trim()).filter(Boolean))
    : null;

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();

  const client: SseClient = {
    silos,
    send(data: string) {
      writer.write(enc.encode(data)).catch(() => {
        clients.delete(client);
      });
    },
  };

  clients.add(client);

  // Initial comment to flush headers through proxies and confirm connectivity
  writer.write(enc.encode(": connected\n\n"));

  // Heartbeat every 25 seconds — keeps the connection alive through proxies
  // and lets clients detect stale connections without waiting for a data event
  const heartbeatInterval = setInterval(() => {
    writer.write(enc.encode(": heartbeat\n\n")).catch(() => {
      clearInterval(heartbeatInterval);
      clients.delete(client);
    });
  }, 25_000);

  // Clean up when the client disconnects
  c.req.raw.signal.addEventListener("abort", () => {
    clearInterval(heartbeatInterval);
    clients.delete(client);
    writer.close().catch(() => {});
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable Nginx buffering so events reach the client immediately
      "X-Accel-Buffering": "no",
    },
  });
});

// ─── GET /v1/stream/status ────────────────────────────────────────────────────
// Diagnostic: returns current SSE connection count and listener state.
streamRouter.get("/status", (c) => {
  return c.json({
    data: {
      connectedClients: clients.size,
      listenerActive: listenerStarted,
    },
    meta: null,
    error: null,
  });
});
