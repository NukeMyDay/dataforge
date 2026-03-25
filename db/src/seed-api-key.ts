import { randomBytes, createHash } from "crypto";
import { db, apiKeys } from "./index.js";

async function seed() {
  const rawKey = `df_${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  await db.insert(apiKeys).values({
    keyHash,
    name: "Test API Key",
    tier: "pro",
    isActive: true,
  });

  console.log("Created test API key:");
  console.log(`  X-API-Key: ${rawKey}`);
  console.log("Store this value — it cannot be recovered from the database.");

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
