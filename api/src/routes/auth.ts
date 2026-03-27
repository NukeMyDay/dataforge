import { Hono } from "hono";
import { sign } from "hono/jwt";
import { scrypt, randomBytes, createHash } from "crypto";
import { promisify } from "util";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, users, apiKeys } from "../db.js";
import { requireJwt } from "../middleware/jwt.js";
import { sendWelcomeEmail } from "../email.js";

const ADMIN_EMAIL = "admin@dataforge.local";
const ADMIN_PASSWORD = process.env["ADMIN_PASSWORD"] ?? "";

// ContextVariableMap extensions for JWT are in middleware/jwt.ts

const scryptAsync = promisify(scrypt);

const JWT_SECRET = process.env["JWT_SECRET"] ?? "change-me-in-production";
const JWT_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

// Hash a password using scrypt (cost-equivalent to bcrypt cost 12)
async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString("hex")}`;
}

// Verify a password against its stored hash
async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return derivedKey.toString("hex") === hash;
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export const authRouter = new Hono();

// POST /v1/auth/register
authRouter.post("/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = z
    .object({ email: z.string().email(), password: z.string().min(8) })
    .safeParse(body);

  if (!parsed.success) {
    return c.json({ data: null, meta: null, error: parsed.error.flatten() }, 400);
  }

  const { email, password } = parsed.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    return c.json({ data: null, meta: null, error: "Email already registered" }, 409);
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ email, passwordHash })
    .returning({ id: users.id, email: users.email, tier: users.tier, createdAt: users.createdAt });

  if (!user) {
    return c.json({ data: null, meta: null, error: "Registration failed" }, 500);
  }

  const token = await sign(
    {
      sub: String(user.id),
      email: user.email,
      role: "user",
      exp: Math.floor(Date.now() / 1000) + JWT_EXPIRY_SECONDS,
    },
    JWT_SECRET,
    "HS256",
  );

  // Send welcome email asynchronously — don't block registration response
  sendWelcomeEmail(user.email).catch((err) => {
    console.error("[auth] Failed to send welcome email:", err);
  });

  return c.json({ data: { token, user }, meta: null, error: null }, 201);
});

// POST /v1/auth/login
authRouter.post("/login", async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = z
    .object({ email: z.string().email(), password: z.string() })
    .safeParse(body);

  if (!parsed.success) {
    return c.json({ data: null, meta: null, error: "Invalid request" }, 400);
  }

  const { email, password } = parsed.data;

  // Admin login: fixed email + ADMIN_PASSWORD env var → JWT with role=admin
  if (email === ADMIN_EMAIL) {
    if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
      return c.json({ data: null, meta: null, error: "Invalid credentials" }, 401);
    }
    const token = await sign(
      {
        sub: "0",
        email: ADMIN_EMAIL,
        role: "admin",
        exp: Math.floor(Date.now() / 1000) + JWT_EXPIRY_SECONDS,
      },
      JWT_SECRET,
      "HS256",
    );
    return c.json({ data: { token }, meta: null, error: null });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.status, "active")))
    .limit(1);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return c.json({ data: null, meta: null, error: "Invalid credentials" }, 401);
  }

  const token = await sign(
    {
      sub: String(user.id),
      email: user.email,
      role: "user",
      exp: Math.floor(Date.now() / 1000) + JWT_EXPIRY_SECONDS,
    },
    JWT_SECRET,
    "HS256",
  );

  return c.json({
    data: {
      token,
      user: { id: user.id, email: user.email, tier: user.tier, createdAt: user.createdAt },
    },
    meta: null,
    error: null,
  });
});

// requireJwt is imported from middleware/jwt.ts

// GET /v1/auth/me
authRouter.get("/me", requireJwt, async (c) => {
  const userId = c.get("jwtUserId") as number;

  const [user] = await db
    .select({ id: users.id, email: users.email, tier: users.tier, status: users.status, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return c.json({ data: null, meta: null, error: "User not found" }, 404);
  }

  return c.json({ data: user, meta: null, error: null });
});

// POST /v1/auth/api-keys — generate a new API key linked to the logged-in user
authRouter.post("/api-keys", requireJwt, async (c) => {
  const userId = c.get("jwtUserId") as number;

  const body = await c.req.json().catch(() => ({}));
  const parsed = z
    .object({ name: z.string().max(128).optional() })
    .safeParse(body);

  if (!parsed.success) {
    return c.json({ data: null, meta: null, error: "Invalid request" }, 400);
  }

  // Fetch user tier to set on the key
  const [user] = await db
    .select({ tier: users.tier })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return c.json({ data: null, meta: null, error: "User not found" }, 404);
  }

  // Generate a secure random key with prefix for identification
  const rawKey = `dfk_${randomBytes(32).toString("hex")}`;
  const keyHash = hashApiKey(rawKey);

  const [record] = await db
    .insert(apiKeys)
    .values({
      keyHash,
      name: parsed.data.name ?? null,
      userId,
      tier: user.tier,
      isActive: true,
    })
    .returning({ id: apiKeys.id, name: apiKeys.name, tier: apiKeys.tier, createdAt: apiKeys.createdAt });

  return c.json(
    {
      data: {
        ...record,
        // Raw key returned once only — not stored, cannot be recovered
        key: rawKey,
      },
      meta: null,
      error: null,
    },
    201,
  );
});

// GET /v1/auth/api-keys — list the logged-in user's API keys
authRouter.get("/api-keys", requireJwt, async (c) => {
  const userId = c.get("jwtUserId") as number;

  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      tier: apiKeys.tier,
      isActive: apiKeys.isActive,
      lastUsedAt: apiKeys.lastUsedAt,
      requestCount: apiKeys.requestCount,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.isActive, true)));

  return c.json({ data: rows, meta: { total: rows.length }, error: null });
});

// DELETE /v1/auth/api-keys/:id — revoke a key belonging to the logged-in user
authRouter.delete("/api-keys/:id", requireJwt, async (c) => {
  const userId = c.get("jwtUserId") as number;
  const keyId = Number(c.req.param("id"));

  if (!Number.isInteger(keyId) || keyId <= 0) {
    return c.json({ data: null, meta: null, error: "Invalid key id" }, 400);
  }

  const [updated] = await db
    .update(apiKeys)
    .set({ isActive: false })
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id });

  if (!updated) {
    return c.json({ data: null, meta: null, error: "API key not found or not owned by you" }, 404);
  }

  return c.json({ data: { id: updated.id, revoked: true }, meta: null, error: null });
});
