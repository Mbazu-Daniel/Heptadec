import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const queryResult = sqliteTable(
  "query_result",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id").notNull(),
    savedQueryId: text("saved_query_id").notNull(),
    ranAt: integer("ran_at", { mode: "timestamp_ms" }).notNull(),
    ttlSeconds: integer("ttl_seconds").notNull(),
    payload: text("payload").notNull(),
  },
  (table) => [
    // A widget's cache read is "newest row for this query", and a write drops
    // the older ones; both walk this index.
    index("query_result_saved_query_ran_idx").on(table.savedQueryId, table.ranAt),
  ],
);

export type QueryResultRow = typeof queryResult.$inferSelect;

export type NewQueryResultRow = typeof queryResult.$inferInsert;
