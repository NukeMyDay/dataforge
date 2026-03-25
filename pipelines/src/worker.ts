import PgBoss from "pg-boss";

const connectionString = process.env["DATABASE_URL"] ?? "postgres://dataforge:dataforge@localhost:5432/dataforge";

const boss = new PgBoss(connectionString);

boss.on("error", (err) => console.error("PgBoss error:", err));

async function start() {
  await boss.start();
  console.log("DataForge worker started");

  // Register job handlers here
  await boss.work("scrape-programs-nl", async (job) => {
    console.log("Processing scrape-programs-nl job:", job.id);
    // TODO: implement NL program scraping
  });

  await boss.work("scrape-programs-de", async (job) => {
    console.log("Processing scrape-programs-de job:", job.id);
    // TODO: implement DE program scraping
  });

  await boss.work("scrape-regulations-nrw", async (job) => {
    console.log("Processing scrape-regulations-nrw job:", job.id);
    // TODO: implement NRW regulation scraping
  });
}

start().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
