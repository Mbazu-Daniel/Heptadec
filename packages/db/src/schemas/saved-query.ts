import { randomUUID } from "node:crypto";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const savedQuery = sqliteTable("saved_query", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id").notNull(),
  dataSourceId: text("data_source_id").notNull(),
  name: text("name").notNull(),
  sql: text("sql").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type SavedQueryRow = typeof savedQuery.$inferSelect;

export type NewSavedQueryRow = typeof savedQuery.$inferInsert;
