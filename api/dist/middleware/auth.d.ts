export type ApiKeyTier = "free" | "pro" | "enterprise";
declare module "hono" {
    interface ContextVariableMap {
        apiKeyTier: ApiKeyTier;
        apiKeyId: number;
    }
}
export declare const authMiddleware: import("hono").MiddlewareHandler<any, string, {}, Response | (Response & import("hono").TypedResponse<{
    data: null;
    meta: null;
    error: string;
}, 401, "json">)>;
//# sourceMappingURL=auth.d.ts.map