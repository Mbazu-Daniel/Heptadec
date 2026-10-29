import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const dashboard = sqliteTable(
  "dashboard",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("dashboard_organization_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export type DashboardRow = typeof dashboard.$inferSelect;

export type NewDashboardRow = typeof dashboard.$inferInsert;
