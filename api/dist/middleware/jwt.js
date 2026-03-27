import { verify } from "hono/jwt";
const JWT_SECRET = process.env["JWT_SECRET"] ?? "change-me-in-production";
// Verifies a Bearer JWT and sets jwtUserId, jwtEmail, jwtRole on the context.
export const requireJwt = async (c, next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return c.json({ data: null, meta: null, error: "Missing or invalid Authorization header" }, 401);
    }
    const token = authHeader.slice(7);
    try {
        const payload = await verify(token, JWT_SECRET, "HS256");
        c.set("jwtUserId", Number(payload["sub"]));
        c.set("jwtEmail", payload["email"]);
        c.set("jwtRole", payload["role"] ?? "user");
    }
    catch {
        return c.json({ data: null, meta: null, error: "Invalid or expired token" }, 401);
    }
    await next();
};
// Requires the JWT to carry role='admin'.
export const requireAdmin = async (c, next) => {
    if (c.get("jwtRole") !== "admin") {
        return c.json({ data: null, meta: null, error: "Admin access required" }, 403);
    }
    await next();
};
//# sourceMappingURL=jwt.js.map