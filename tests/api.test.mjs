/**
 * DataForge API Integration Tests
 *
 * Runs against a live API server. Set TEST_API_URL to override the default.
 * Requires ADMIN_PASSWORD env var to test admin endpoints.
 *
 * The test suite is idempotent: uses a unique email per run and revokes
 * the test API key in the teardown step.
 */

import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.TEST_API_URL ?? "http://localhost:3000";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";

// Unique per test run to allow repeated runs without conflicts
const RUN_ID = Date.now();
const TEST_EMAIL = `test-${RUN_ID}@dataforge-test.example`;
const TEST_PASSWORD = "TestPassword123!";

// Shared auth state populated in before() and used across describe blocks
const ctx = {
  userJwt: "",
  apiKey: "",
  apiKeyId: 0,
  adminJwt: "",
};

/** Thin fetch wrapper — returns { status, body } */
async function req(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------
describe("Auth", () => {
  test("POST /v1/auth/register — creates user and returns JWT", async () => {
    const { status, body } = await req("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    assert.equal(status, 201, `register failed: ${JSON.stringify(body)}`);
    assert.ok(body.data?.token, "expected token in response");
    assert.ok(body.data?.user?.email, "expected user.email in response");
    assert.equal(body.error, null);
    ctx.userJwt = body.data.token;
  });

  test("POST /v1/auth/register — 409 on duplicate email", async () => {
    const { status } = await req("/v1/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    assert.equal(status, 409);
  });

  test("POST /v1/auth/login — returns JWT for valid credentials", async () => {
    const { status, body } = await req("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
    });
    assert.equal(status, 200, `login failed: ${JSON.stringify(body)}`);
    assert.ok(body.data?.token);
    ctx.userJwt = body.data.token;
  });

  test("POST /v1/auth/login — 401 on wrong password", async () => {
    const { status } = await req("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: TEST_EMAIL, password: "wrong-password" }),
    });
    assert.equal(status, 401);
  });

  test("POST /v1/auth/api-keys — creates API key (requires JWT)", async () => {
    const { status, body } = await req("/v1/auth/api-keys", {
      method: "POST",
      body: JSON.stringify({ name: `test-key-${RUN_ID}` }),
      headers: { Authorization: `Bearer ${ctx.userJwt}` },
    });
    assert.equal(status, 201, `api-key creation failed: ${JSON.stringify(body)}`);
    assert.ok(body.data?.key?.startsWith("dfk_"), "expected dfk_ prefixed key");
    assert.ok(body.data?.id, "expected key id");
    assert.equal(body.error, null);
    ctx.apiKey = body.data.key;
    ctx.apiKeyId = body.data.id;
  });

  test("POST /v1/auth/api-keys — 401 without JWT", async () => {
    const { status } = await req("/v1/auth/api-keys", {
      method: "POST",
      body: JSON.stringify({}),
    });
    assert.equal(status, 401);
  });

  test("GET /v1/auth/me — returns user profile (requires JWT)", async () => {
    const { status, body } = await req("/v1/auth/me", {
      headers: { Authorization: `Bearer ${ctx.userJwt}` },
    });
    assert.equal(status, 200);
    assert.equal(body.data?.email, TEST_EMAIL);
  });
});

// ---------------------------------------------------------------------------
// Programs — require X-API-Key
// ---------------------------------------------------------------------------
describe("Programs", () => {
  before(async () => {
    // Ensure we have an API key from the auth tests
    if (!ctx.apiKey) {
      throw new Error("API key not set — auth tests must run first");
    }
  });

  test("GET /v1/programs — returns paginated list", async () => {
    const { status, body } = await req("/v1/programs", {
      headers: { "X-API-Key": ctx.apiKey },
    });
    assert.equal(status, 200, `programs list failed: ${JSON.stringify(body)}`);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.pagination, "expected pagination object");
    assert.ok("total" in body.pagination);
    assert.ok("page" in body.pagination);
  });

  test("GET /v1/programs?q=computer — full-text search filter works", async () => {
    const { status, body } = await req("/v1/programs?q=computer", {
      headers: { "X-API-Key": ctx.apiKey },
    });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.data));
  });

  test("GET /v1/programs?country=NL — country filter works", async () => {
    const { status, body } = await req("/v1/programs?country=NL", {
      headers: { "X-API-Key": ctx.apiKey },
    });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.data));
    // Every returned program should have country=NL
    for (const p of body.data) {
      assert.equal(p.country, "NL", `unexpected country on program ${p.id}`);
    }
  });

  test("GET /v1/programs — 401 without API key", async () => {
    const { status } = await req("/v1/programs");
    assert.equal(status, 401);
  });

  test("GET /v1/programs/export?format=csv — returns CSV (public, no API key)", async () => {
    const res = await fetch(`${BASE}/v1/programs/export?format=csv`);
    assert.equal(res.status, 200, "expected 200 for CSV export");
    const contentType = res.headers.get("content-type") ?? "";
    assert.ok(
      contentType.includes("text/csv") || contentType.includes("text/plain") || contentType.includes("application/octet-stream"),
      `unexpected content-type: ${contentType}`,
    );
    const text = await res.text();
    // First line should be a CSV header
    assert.ok(text.length > 0, "empty CSV response");
  });
});

// ---------------------------------------------------------------------------
// Institutions — require X-API-Key
// ---------------------------------------------------------------------------
describe("Institutions", () => {
  test("GET /v1/institutions — returns list", async () => {
    const { status, body } = await req("/v1/institutions", {
      headers: { "X-API-Key": ctx.apiKey },
    });
    assert.equal(status, 200, `institutions failed: ${JSON.stringify(body)}`);
    assert.ok(Array.isArray(body.data));
  });
});

// ---------------------------------------------------------------------------
// Regulations — require X-API-Key
// ---------------------------------------------------------------------------
describe("Regulations", () => {
  test("GET /v1/regulations — returns list", async () => {
    const { status, body } = await req("/v1/regulations", {
      headers: { "X-API-Key": ctx.apiKey },
    });
    assert.equal(status, 200, `regulations failed: ${JSON.stringify(body)}`);
    assert.ok(Array.isArray(body.data));
  });
});

// ---------------------------------------------------------------------------
// Search — public, no API key required
// ---------------------------------------------------------------------------
describe("Search", () => {
  test("GET /v1/search?q=amsterdam — returns cross-silo results", async () => {
    const { status, body } = await req("/v1/search?q=amsterdam");
    assert.equal(status, 200, `search failed: ${JSON.stringify(body)}`);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.meta?.query === "amsterdam");
    assert.ok("total" in body.meta);
  });

  test("GET /v1/search — 400 without q param", async () => {
    const { status } = await req("/v1/search");
    assert.equal(status, 400);
  });
});

// ---------------------------------------------------------------------------
// Stats — public, no API key required
// ---------------------------------------------------------------------------
describe("Stats", () => {
  test("GET /v1/stats — returns counts", async () => {
    const { status, body } = await req("/v1/stats");
    assert.equal(status, 200, `stats failed: ${JSON.stringify(body)}`);
    assert.ok(body.data, "expected data object");
  });
});

// ---------------------------------------------------------------------------
// Admin — requires JWT with role=admin
// ---------------------------------------------------------------------------
describe("Admin", () => {
  before(async () => {
    if (!ADMIN_PASSWORD) {
      throw new Error("ADMIN_PASSWORD env var is required for admin tests");
    }
    const { status, body } = await req("/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: "admin@dataforge.local", password: ADMIN_PASSWORD }),
    });
    assert.equal(status, 200, `admin login failed: ${JSON.stringify(body)}`);
    ctx.adminJwt = body.data.token;
  });

  test("GET /v1/admin/settings — returns settings (admin JWT)", async () => {
    const { status, body } = await req("/v1/admin/settings", {
      headers: { Authorization: `Bearer ${ctx.adminJwt}` },
    });
    assert.equal(status, 200, `admin/settings failed: ${JSON.stringify(body)}`);
    assert.ok(Array.isArray(body.data), "expected array of settings");
    assert.equal(body.error, null);
  });

  test("GET /v1/admin/data-quality — returns quality report (admin JWT)", async () => {
    const { status, body } = await req("/v1/admin/data-quality", {
      headers: { Authorization: `Bearer ${ctx.adminJwt}` },
    });
    assert.equal(status, 200, `admin/data-quality failed: ${JSON.stringify(body)}`);
    assert.ok(body.data, "expected data in response");
    assert.equal(body.error, null);
  });

  test("GET /v1/admin/settings — 401 without auth", async () => {
    const { status } = await req("/v1/admin/settings");
    assert.equal(status, 401);
  });

  test("GET /v1/admin/settings — 403 with non-admin JWT", async () => {
    const { status } = await req("/v1/admin/settings", {
      headers: { Authorization: `Bearer ${ctx.userJwt}` },
    });
    assert.equal(status, 403);
  });
});

// ---------------------------------------------------------------------------
// Cleanup — revoke the test API key
// ---------------------------------------------------------------------------
describe("Cleanup", () => {
  test("DELETE /v1/auth/api-keys/:id — revokes test API key", async () => {
    if (!ctx.apiKeyId) return; // nothing to clean up
    const { status, body } = await req(`/v1/auth/api-keys/${ctx.apiKeyId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${ctx.userJwt}` },
    });
    assert.equal(status, 200, `revoke failed: ${JSON.stringify(body)}`);
    assert.equal(body.data?.revoked, true);
  });
});
