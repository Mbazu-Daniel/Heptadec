import { randomUUID } from "node:crypto";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { organization } from "./organization/organization";

export const dashboardDataSource = sqliteTable(
  "dashboard_data_source",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    dashboardId: text("dashboard_id").notNull(),
    dataSourceId: text("data_source_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("dashboard_data_source_unique").on(table.dashboardId, table.dataSourceId)],
);

export type DashboardDataSourceRow = typeof dashboardDataSource.$inferSelect;

export type NewDashboardDataSourceRow = typeof dashboardDataSource.$inferInsert;
