import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization/organization";

export const scheduledJob = sqliteTable(
  "scheduled_job",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    savedQueryId: text("saved_query_id").notNull(),
    name: text("name").notNull(),
    cron: text("cron").notNull(),
    timezone: text("timezone").notNull(),
    ttlSeconds: integer("ttl_seconds").notNull(),
    nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }).notNull(),
    leaseUntil: integer("lease_until", { mode: "timestamp_ms" }),
    lastRunAt: integer("last_run_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("scheduled_job_next_run_idx").on(table.nextRunAt),
    index("scheduled_job_organization_idx").on(table.organizationId),
  ],
);

export type ScheduledJobRow = typeof scheduledJob.$inferSelect;

export type NewScheduledJobRow = typeof scheduledJob.$inferInsert;
