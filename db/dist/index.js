import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";
const connectionString = process.env["DATABASE_URL"] ?? "postgres://dataforge:dataforge@localhost:5432/dataforge";
const client = postgres(connectionString);
export const db = drizzle(client, { schema });
// Factory for a dedicated LISTEN/NOTIFY connection.
// Each caller is responsible for keeping the returned client alive.
// The postgres package internally uses a reserved connection for listen.
export function createListenClient() {
    return postgres(connectionString, { max: 1 });
}
export * from "./schema/index.js";
//# sourceMappingURL=index.js.map