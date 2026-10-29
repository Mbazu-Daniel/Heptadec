import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const savedQuery = sqliteTable(
  "saved_query",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id").notNull(),
    dataSourceId: text("data_source_id").notNull(),
    name: text("name").notNull(),
    sql: text("sql").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("saved_query_source_created_idx").on(
      table.dataSourceId,
      table.organizationId,
      table.createdAt,
    ),
    index("saved_query_organization_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export type SavedQueryRow = typeof savedQuery.$inferSelect;

export type NewSavedQueryRow = typeof savedQuery.$inferInsert;
