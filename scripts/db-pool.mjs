import pg from "pg";

const { Pool } = pg;

export function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL environment variable is required");
  return new Pool({ connectionString: url });
}
