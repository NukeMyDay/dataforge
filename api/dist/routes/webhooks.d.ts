import { Hono } from "hono";
export declare const webhooksRouter: Hono<import("hono/types").BlankEnv, import("hono/types").BlankSchema, "/">;
declare const VALID_EVENTS: readonly ["program.created", "program.updated", "institution.created", "institution.updated", "regulation.created", "regulation.updated", "pipeline.completed"];
export declare function deliverWebhookEvent(eventType: (typeof VALID_EVENTS)[number], payload: Record<string, unknown>): Promise<void>;
export {};
//# sourceMappingURL=webhooks.d.ts.map