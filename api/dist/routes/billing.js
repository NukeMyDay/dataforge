import { Hono } from "hono";
import { createHmac, timingSafeEqual } from "crypto";
import { eq } from "drizzle-orm";
import { db, users } from "../db.js";
import { requireJwt } from "../middleware/jwt.js";
export const billingRouter = new Hono();
const STRIPE_SECRET_KEY = process.env["STRIPE_SECRET_KEY"] ?? "";
const STRIPE_WEBHOOK_SECRET = process.env["STRIPE_WEBHOOK_SECRET"] ?? "";
const STRIPE_PRO_PRICE_ID = process.env["STRIPE_PRO_PRICE_ID"] ?? "";
const WEB_BASE = process.env["WEB_BASE_URL"] ?? "https://gonear.de";
const STRIPE_API = "https://api.stripe.com/v1";
// Call the Stripe REST API with form-encoded body
async function stripeRequest(method, path, params) {
    const body = params ? new URLSearchParams(params).toString() : undefined;
    const res = await fetch(`${STRIPE_API}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
    });
    const json = await res.json();
    if (!res.ok) {
        const err = json.error;
        throw new Error(err?.message ?? `Stripe error ${res.status}`);
    }
    return json;
}
// Verify Stripe webhook signature
function verifyStripeSignature(payload, sigHeader, secret) {
    const parts = sigHeader.split(",").reduce((acc, part) => {
        const [k, v] = part.split("=");
        if (k && v)
            acc[k] = v;
        return acc;
    }, {});
    const timestamp = parts["t"];
    const sig = parts["v1"];
    if (!timestamp || !sig)
        return false;
    const signed = `${timestamp}.${payload}`;
    const expected = createHmac("sha256", secret).update(signed).digest("hex");
    try {
        return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(sig, "hex"));
    }
    catch {
        return false;
    }
}
function tierFromPriceId(priceId) {
    if (priceId === STRIPE_PRO_PRICE_ID)
        return "pro";
    // add enterprise price ID logic here when needed
    return "free";
}
// POST /v1/billing/checkout — create a Stripe Checkout session for pro upgrade
billingRouter.post("/checkout", requireJwt, async (c) => {
    if (!STRIPE_SECRET_KEY) {
        return c.json({ data: null, meta: null, error: "Billing not configured" }, 503);
    }
    if (!STRIPE_PRO_PRICE_ID) {
        return c.json({ data: null, meta: null, error: "Pro price not configured" }, 503);
    }
    const userId = c.get("jwtUserId");
    const [user] = await db
        .select({ id: users.id, email: users.email, tier: users.tier, stripeCustomerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    if (!user) {
        return c.json({ data: null, meta: null, error: "User not found" }, 404);
    }
    if (user.tier !== "free") {
        return c.json({ data: null, meta: null, error: "Already on a paid plan" }, 400);
    }
    // Ensure customer exists in Stripe
    let customerId = user.stripeCustomerId;
    if (!customerId) {
        const customer = (await stripeRequest("POST", "/customers", { email: user.email }));
        customerId = customer.id;
        await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId));
    }
    const session = (await stripeRequest("POST", "/checkout/sessions", {
        customer: customerId,
        mode: "subscription",
        "line_items[0][price]": STRIPE_PRO_PRICE_ID,
        "line_items[0][quantity]": "1",
        success_url: `${WEB_BASE}/dashboard?upgrade=success`,
        cancel_url: `${WEB_BASE}/dashboard?upgrade=cancelled`,
        "subscription_data[metadata][userId]": String(userId),
    }));
    return c.json({ data: { url: session.url }, meta: null, error: null });
});
// POST /v1/billing/portal — open Stripe Customer Portal for subscription management
billingRouter.post("/portal", requireJwt, async (c) => {
    if (!STRIPE_SECRET_KEY) {
        return c.json({ data: null, meta: null, error: "Billing not configured" }, 503);
    }
    const userId = c.get("jwtUserId");
    const [user] = await db
        .select({ stripeCustomerId: users.stripeCustomerId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
    if (!user?.stripeCustomerId) {
        return c.json({ data: null, meta: null, error: "No billing account found" }, 404);
    }
    const session = (await stripeRequest("POST", "/billing_portal/sessions", {
        customer: user.stripeCustomerId,
        return_url: `${WEB_BASE}/dashboard`,
    }));
    return c.json({ data: { url: session.url }, meta: null, error: null });
});
// POST /v1/billing/webhook — handle Stripe events; MUST be public (no auth)
billingRouter.post("/webhook", async (c) => {
    if (!STRIPE_WEBHOOK_SECRET) {
        return c.json({ error: "Webhook not configured" }, 503);
    }
    const sig = c.req.header("stripe-signature");
    if (!sig) {
        return c.json({ error: "Missing signature" }, 400);
    }
    const payload = await c.req.text();
    if (!verifyStripeSignature(payload, sig, STRIPE_WEBHOOK_SECRET)) {
        return c.json({ error: "Invalid signature" }, 400);
    }
    let event;
    try {
        event = JSON.parse(payload);
    }
    catch {
        return c.json({ error: "Invalid JSON" }, 400);
    }
    const sub = event.data.object;
    if (event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated") {
        const customerId = sub["customer"];
        const status = sub["status"];
        const priceId = (sub["items"].data[0]?.price.id) ?? "";
        const subscriptionId = sub["id"];
        const periodEnd = sub["current_period_end"];
        const tier = status === "active" || status === "trialing" ? tierFromPriceId(priceId) : "free";
        await db
            .update(users)
            .set({
            tier: tier,
            stripeSubscriptionId: subscriptionId,
            stripeSubscriptionStatus: status,
            stripePriceId: priceId,
            subscriptionCurrentPeriodEnd: new Date(periodEnd * 1000),
        })
            .where(eq(users.stripeCustomerId, customerId));
        // Sync tier to all active API keys for this user
        const [updatedUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.stripeCustomerId, customerId))
            .limit(1);
        if (updatedUser) {
            const { apiKeys } = await import("../db.js");
            await db
                .update(apiKeys)
                .set({ tier: tier })
                .where(eq(apiKeys.userId, updatedUser.id));
        }
    }
    if (event.type === "customer.subscription.deleted") {
        const customerId = sub["customer"];
        await db
            .update(users)
            .set({
            tier: "free",
            stripeSubscriptionId: null,
            stripeSubscriptionStatus: "cancelled",
            stripePriceId: null,
            subscriptionCurrentPeriodEnd: null,
        })
            .where(eq(users.stripeCustomerId, customerId));
        const [updatedUser] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.stripeCustomerId, customerId))
            .limit(1);
        if (updatedUser) {
            const { apiKeys } = await import("../db.js");
            await db
                .update(apiKeys)
                .set({ tier: "free" })
                .where(eq(apiKeys.userId, updatedUser.id));
        }
    }
    return c.json({ received: true });
});
//# sourceMappingURL=billing.js.map