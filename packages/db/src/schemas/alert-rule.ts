import { randomUUID } from "node:crypto";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const alertRule = sqliteTable("alert_rule", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id").notNull(),
  savedQueryId: text("saved_query_id").notNull(),
  name: text("name").notNull(),
  column: text("column").notNull(),
  operator: text("operator").notNull(),
  threshold: real("threshold").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type AlertRuleRow = typeof alertRule.$inferSelect;

export type NewAlertRuleRow = typeof alertRule.$inferInsert;
