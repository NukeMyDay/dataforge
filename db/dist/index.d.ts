import postgres from "postgres";
import * as schema from "./schema/index.js";
export declare const db: import("drizzle-orm/postgres-js").PostgresJsDatabase<typeof schema>;
export declare function createListenClient(): postgres.Sql<{}>;
export * from "./schema/index.js";
export type { InferSelectModel, InferInsertModel } from "drizzle-orm";
//# sourceMappingURL=index.d.ts.map