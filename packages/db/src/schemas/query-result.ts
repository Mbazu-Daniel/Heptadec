import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization/organization";

export const queryResult = sqliteTable(
  "query_result",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    savedQueryId: text("saved_query_id").notNull(),
    ranAt: integer("ran_at", { mode: "timestamp_ms" }).notNull(),
    ttlSeconds: integer("ttl_seconds").notNull(),
    payload: text("payload").notNull(),
  },
  (table) => [
    index("query_result_saved_query_ran_idx").on(table.savedQueryId, table.ranAt),
  ],
);

export type QueryResultRow = typeof queryResult.$inferSelect;

export type NewQueryResultRow = typeof queryResult.$inferInsert;
