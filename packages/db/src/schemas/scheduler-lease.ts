import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const schedulerLease = sqliteTable("scheduler_lease", {
  name: text("name").primaryKey(),
  leaseUntil: integer("lease_until", { mode: "timestamp_ms" }).notNull(),
});

export type SchedulerLeaseRow = typeof schedulerLease.$inferSelect;
