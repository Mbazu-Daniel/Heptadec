import { randomUUID } from "node:crypto";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const alertDelivery = sqliteTable("alert_delivery", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id").notNull(),
  alertRuleId: text("alert_rule_id").notNull(),
  channel: text("channel").notNull(),
  status: text("status").notNull(),
  message: text("message").notNull(),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type AlertDeliveryRow = typeof alertDelivery.$inferSelect;

export type NewAlertDeliveryRow = typeof alertDelivery.$inferInsert;
