import { Hono } from "hono";
import { z } from "zod";
export const chatRouter = new Hono();
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001"; // Fast + cheap for chat
const chatSchema = z.object({
    message: z.string().min(1).max(2000),
    context: z
        .object({
        silo: z.enum(["education", "regulatory"]).optional(),
        slug: z.string().optional(),
    })
        .optional(),
});
chatRouter.post("/", async (c) => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
        return c.json({ error: "AI chat is not configured (missing ANTHROPIC_API_KEY)" }, 503);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
        return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
    }
    const { message } = parsed.data;
    const systemPrompt = "You are DataForge AI, a helpful assistant for a structured data platform. " +
        "Be concise and direct. If you don't know something, say so clearly.";
    try {
        const res = await fetch(ANTHROPIC_API_URL, {
            method: "POST",
            headers: {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            body: JSON.stringify({
                model: ANTHROPIC_MODEL,
                max_tokens: 1024,
                system: systemPrompt,
                messages: [{ role: "user", content: message }],
            }),
        });
        if (!res.ok) {
            const err = await res.text();
            console.error("Anthropic API error:", res.status, err);
            return c.json({ error: "AI service error" }, 502);
        }
        const data = (await res.json());
        const text = data.content.find((b) => b.type === "text")?.text ?? "";
        return c.json({
            data: { reply: text },
            meta: { tokens: data.usage },
            error: null,
        });
    }
    catch (err) {
        console.error("Chat error:", err);
        return c.json({ error: "Failed to reach AI service" }, 502);
    }
});
//# sourceMappingURL=chat.js.map