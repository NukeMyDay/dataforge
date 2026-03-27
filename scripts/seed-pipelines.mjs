/**
 * Seeds the pipelines table with the default DataForge pipeline definitions.
 * Safe to run multiple times (idempotent via ON CONFLICT DO NOTHING).
 *
 * Usage: node scripts/seed-pipelines.mjs
 */

import { createPool } from "./db-pool.mjs";

const PIPELINES = [
  {
    name: "scrape-programs-nl",
    description: "Netherlands study programs from studyfinder.nl",
    schedule: "0 3 * * 1", // Monday 03:00 UTC
    enabled: true,
  },
  {
    name: "scrape-programs-nl-sk123",
    description: "Netherlands study programs from studiekeuze123.nl",
    schedule: "0 3 * * 3", // Wednesday 03:00 UTC
    enabled: true,
  },
  {
    name: "scrape-programs-de",
    description: "German study programs from hochschulkompass.de / daad.de",
    schedule: "0 3 * * 2", // Tuesday 03:00 UTC
    enabled: true,
  },
  {
    name: "scrape-regulations-nrw",
    description: "NRW event permit regulations",
    schedule: "0 4 * * 1", // Monday 04:00 UTC
    enabled: true,
  },
  {
    name: "scrape-programs-fr",
    description: "French study programs from campusfrance.org",
    schedule: "0 3 * * 5", // Friday 03:00 UTC
    enabled: true,
  },
  {
    name: "scrape-programs-gb",
    description: "UK study programs from study-uk.britishcouncil.org",
    schedule: "0 3 * * 6", // Saturday 03:00 UTC
    enabled: true,
  },
  {
    name: "scrape-programs-ch",
    description: "Swiss study programs from studyprogrammes.ch",
    schedule: "0 3 * * 0", // Sunday 03:00 UTC
    enabled: true,
  },
  {
    name: "scrape-programs-es",
    description: "Spanish study programs from universidad.es",
    schedule: "0 5 * * 1", // Monday 05:00 UTC
    enabled: true,
  },
  {
    name: "scrape-programs-it",
    description: "Italian study programs from universitaly.it",
    schedule: "0 4 * * 2", // Tuesday 04:00 UTC
    enabled: true,
  },
  {
    name: "scrape-programs-se",
    description: "Swedish study programs from universityadmissions.se",
    schedule: "0 5 * * 3", // Wednesday 05:00 UTC
    enabled: true,
  },
  // ─── Gründungs vertical (Silo 2) ─────────────────────────────────────────
  {
    name: "scrape-rechtsformen",
    description: "German legal entity types (Rechtsformen + Gewerbeanmeldung) from existenzgruender.de and service.bund.de",
    schedule: "0 3 * * 1", // Monday 03:00 UTC
    enabled: true,
  },
  {
    name: "scrape-sv",
    description: "German social security contribution rates and obligations from DRV/GKV",
    schedule: "0 4 * * 1", // Monday 04:00 UTC
    enabled: true,
  },
  {
    name: "scrape-steuern",
    description: "German tax obligations and deadlines from BMF/ELSTER",
    schedule: "0 5 * * 1", // Monday 05:00 UTC
    enabled: true,
  },
  {
    name: "scrape-genehmigungen",
    description: "German business permits and Berufsgenossenschaft obligations",
    schedule: "0 6 * * 1", // Monday 06:00 UTC
    enabled: true,
  },
  {
    name: "scrape-funding-bund",
    description: "German federal funding programs from foerderdatenbank.de",
    schedule: "0 2 * * 0", // Sunday 02:00 UTC
    enabled: true,
  },
];

const pool = createPool();

for (const p of PIPELINES) {
  await pool.query(
    `INSERT INTO pipelines (name, description, schedule, enabled)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (name) DO NOTHING`,
    [p.name, p.description, p.schedule, p.enabled],
  );
  console.log(`  ✓ ${p.name}`);
}

await pool.end();
console.log("Pipelines seeded.");
