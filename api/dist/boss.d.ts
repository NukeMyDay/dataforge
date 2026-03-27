/**
 * Enqueue a pg-boss job by inserting directly into the pgboss.job table.
 * This avoids importing the pg-boss runtime in the API package.
 * The job state 'created' is the default initial state in pg-boss v9.
 */
export declare function sendJob(jobName: string, data?: Record<string, unknown>): Promise<string>;
//# sourceMappingURL=boss.d.ts.map