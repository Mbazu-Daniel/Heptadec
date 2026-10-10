import { randomUUID } from "node:crypto";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const widget = sqliteTable("widget", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id").notNull(),
  dashboardId: text("dashboard_id").notNull(),
  savedQueryId: text("saved_query_id").notNull(),
  chartType: text("chart_type").notNull(),
  title: text("title").notNull(),
  labelColumn: text("label_column").notNull(),
  valueColumn: text("value_column").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type WidgetRow = typeof widget.$inferSelect;

export type NewWidgetRow = typeof widget.$inferInsert;
