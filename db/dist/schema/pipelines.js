import { boolean, integer, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
export const pipelineStatusEnum = pgEnum("pipeline_status", [
    "idle",
    "running",
    "succeeded",
    "failed",
]);
export const pipelines = pgTable("pipelines", {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 128 }).notNull().unique(),
    description: text("description"),
    schedule: varchar("schedule", { length: 128 }),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const pipelineRuns = pgTable("pipeline_runs", {
    id: serial("id").primaryKey(),
    pipelineId: integer("pipeline_id")
        .notNull()
        .references(() => pipelines.id, { onDelete: "cascade" }),
    status: pipelineStatusEnum("status").notNull().default("idle"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    recordsProcessed: integer("records_processed"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
//# sourceMappingURL=pipelines.js.map