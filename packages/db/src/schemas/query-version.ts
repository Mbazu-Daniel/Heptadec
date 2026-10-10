import { randomUUID } from "node:crypto";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const queryVersion = sqliteTable("query_version", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id").notNull(),
  savedQueryId: text("saved_query_id").notNull(),
  name: text("name").notNull(),
  sql: text("sql").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type QueryVersionRow = typeof queryVersion.$inferSelect;

export type NewQueryVersionRow = typeof queryVersion.$inferInsert;
