import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.js";
const connectionString = process.env["DATABASE_URL"] ?? "postgres://dataforge:dataforge@localhost:5432/dataforge";
const client = postgres(connectionString);
const db = drizzle(client, { schema });
function createListenClient() {
  return postgres(connectionString, { max: 1 });
}
export * from "./schema/index.js";
export {
  createListenClient,
  db
};
