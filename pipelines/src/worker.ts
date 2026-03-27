import PgBoss from "pg-boss";
import { runQuotaWarnings } from "./jobs/quota-warnings.js";
import { scrapeFundingBund } from "./jobs/scrape-funding-bund.js";
import { scrapeRechtsformen } from "./jobs/scrape-rechtsformen.js";
import { scrapeSozialversicherung } from "./jobs/scrape-sozialversicherung.js";
import { scrapeSteuern } from "./jobs/scrape-steuern.js";
import { scrapeGenehmigungen } from "./jobs/scrape-genehmigungen.js";

const connectionString =
  process.env["DATABASE_URL"] ?? "postgres://dataforge:dataforge@localhost:5432/dataforge";

const SCHEDULE_SCRAPE_FUNDING = "0 2 * * 0"; // every Sunday at 02:00 UTC
const SCHEDULE_SCRAPE_RECHTSFORMEN = "0 3 * * 1"; // every Monday at 03:00 UTC
const SCHEDULE_SCRAPE_SOZIALVERSICHERUNG = "0 4 * * 1"; // every Monday at 04:00 UTC
const SCHEDULE_SCRAPE_STEUERN = "0 5 * * 1"; // every Monday at 05:00 UTC
const SCHEDULE_SCRAPE_GENEHMIGUNGEN = "0 6 * * 1"; // every Monday at 06:00 UTC
const SCHEDULE_QUOTA_WARNINGS = "0 10 * * *"; // every day at 10:00 UTC

const boss = new PgBoss(connectionString);

boss.on("error", (err) => console.error("PgBoss error:", err));

async function start() {
  await boss.start();
  console.log("DataForge worker started");

  // Funding programs (foerderdatenbank.de) — runs weekly Sunday 02:00 UTC
  await boss.work("scrape-funding-bund", { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    console.log(`[worker] scrape-funding-bund job started (id=${job.id})`);
    await scrapeFundingBund();
  });
  await boss.schedule("scrape-funding-bund", SCHEDULE_SCRAPE_FUNDING, {}, { singletonKey: "weekly" });
  console.log(`[worker] scrape-funding-bund scheduled: ${SCHEDULE_SCRAPE_FUNDING}`);

  // Rechtsformen + Gewerbeanmeldung (existenzgruender.de / service.bund.de) — weekly Monday 03:00 UTC
  await boss.work("scrape-rechtsformen", { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    console.log(`[worker] scrape-rechtsformen job started (id=${job.id})`);
    await scrapeRechtsformen();
  });
  await boss.schedule("scrape-rechtsformen", SCHEDULE_SCRAPE_RECHTSFORMEN, {}, { singletonKey: "weekly" });
  console.log(`[worker] scrape-rechtsformen scheduled: ${SCHEDULE_SCRAPE_RECHTSFORMEN}`);

  // Sozialversicherung rates + obligations — weekly Monday 04:00 UTC
  await boss.work("scrape-sv", { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    console.log(`[worker] scrape-sv job started (id=${job.id})`);
    await scrapeSozialversicherung();
  });
  await boss.schedule("scrape-sv", SCHEDULE_SCRAPE_SOZIALVERSICHERUNG, {}, { singletonKey: "weekly" });
  console.log(`[worker] scrape-sv scheduled: ${SCHEDULE_SCRAPE_SOZIALVERSICHERUNG}`);

  // Steuerliche Pflichten + Fristen (bundesfinanzministerium.de / elster.de) — weekly Monday 05:00 UTC
  await boss.work("scrape-steuern", { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    console.log(`[worker] scrape-steuern job started (id=${job.id})`);
    await scrapeSteuern();
  });
  await boss.schedule("scrape-steuern", SCHEDULE_SCRAPE_STEUERN, {}, { singletonKey: "weekly" });
  console.log(`[worker] scrape-steuern scheduled: ${SCHEDULE_SCRAPE_STEUERN}`);

  // Genehmigungen + Berufsgenossenschaften (gesetze-im-internet.de / ihk.de / dguv.de) — weekly Monday 06:00 UTC
  await boss.work("scrape-genehmigungen", { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    console.log(`[worker] scrape-genehmigungen job started (id=${job.id})`);
    await scrapeGenehmigungen();
  });
  await boss.schedule("scrape-genehmigungen", SCHEDULE_SCRAPE_GENEHMIGUNGEN, {}, { singletonKey: "weekly" });
  console.log(`[worker] scrape-genehmigungen scheduled: ${SCHEDULE_SCRAPE_GENEHMIGUNGEN}`);

  // Quota + expiry warning emails — daily at 10:00 UTC
  await boss.work("quota-warnings", { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    console.log(`[worker] quota-warnings job started (id=${job.id})`);
    await runQuotaWarnings();
  });

  await boss.schedule("quota-warnings", SCHEDULE_QUOTA_WARNINGS, {}, { singletonKey: "daily" });
  console.log(`[worker] quota-warnings scheduled: ${SCHEDULE_QUOTA_WARNINGS}`);
}

start().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
