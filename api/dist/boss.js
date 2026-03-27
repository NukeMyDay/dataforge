import { sql } from "drizzle-orm";
import { db } from "./db.js";
/**
 * Enqueue a pg-boss job by inserting directly into the pgboss.job table.
 * This avoids importing the pg-boss runtime in the API package.
 * The job state 'created' is the default initial state in pg-boss v9.
 */
export async function sendJob(jobName, data = {}) {
    const result = await db.execute(sql `INSERT INTO pgboss.job (name, data, state, startafter, expirein, keepuntil)
        VALUES (
          ${jobName},
          ${JSON.stringify(data)}::jsonb,
          'created',
          now(),
          interval '15 minutes',
          now() + interval '14 days'
        )
        RETURNING id::text`);
    const row = result[0];
    return row?.id ?? "";
}
//# sourceMappingURL=boss.js.map