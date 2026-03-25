import PgBoss from "pg-boss";
import { scrapeProgramsNl } from "./jobs/scrape-programs-nl.js";

const connectionString =
  process.env["DATABASE_URL"] ?? "postgres://dataforge:dataforge@localhost:5432/dataforge";

// Weekly schedule: every Monday at 03:00 UTC
const SCHEDULE_SCRAPE_NL = "0 3 * * 1";

const boss = new PgBoss(connectionString);

boss.on("error", (err) => console.error("PgBoss error:", err));

async function start() {
  await boss.start();
  console.log("DataForge worker started");

  // NL programs pipeline — runs weekly, also triggerable on demand
  await boss.work("scrape-programs-nl", { teamSize: 1, teamConcurrency: 1 }, async (job) => {
    console.log(`[worker] scrape-programs-nl job started (id=${job.id})`);
    await scrapeProgramsNl();
  });

  await boss.schedule("scrape-programs-nl", SCHEDULE_SCRAPE_NL, {}, { singletonKey: "weekly" });
  console.log(`[worker] scrape-programs-nl scheduled: ${SCHEDULE_SCRAPE_NL}`);

  // Placeholder handlers for future pipelines
  await boss.work("scrape-programs-de", async (job) => {
    console.log(`[worker] scrape-programs-de job started (id=${job.id})`);
    // TODO: implement DE program scraping
  });

  await boss.work("scrape-regulations-nrw", async (job) => {
    console.log(`[worker] scrape-regulations-nrw job started (id=${job.id})`);
    // TODO: implement NRW regulation scraping
  });
}

start().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
