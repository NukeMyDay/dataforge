import type { MiddlewareHandler } from "hono";
declare module "hono" {
    interface ContextVariableMap {
        jwtUserId: number;
        jwtEmail: string;
        jwtRole: string;
    }
}
export declare const requireJwt: MiddlewareHandler;
export declare const requireAdmin: MiddlewareHandler;
//# sourceMappingURL=jwt.d.ts.map