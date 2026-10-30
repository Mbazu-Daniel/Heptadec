import { randomUUID } from "node:crypto";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { StructureState } from "../structure-state";

/**
 * What the app knows about one source's structure, and where its read stands.
 *
 * The row is both the queue position and the result, because they are one fact:
 * a source has exactly one current structure, and reading it is work the app
 * does in the background rather than inside the request that asks for it. The
 * payload therefore survives a re-queue — a source being read again still has
 * the last structure the app saw — and an engine whose list is its own data
 * (Redis keys, Quickwit indexes) has no row at all and is read live.
 */
export const dataSourceStructure = sqliteTable(
  "data_source_structure",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id").notNull(),
    dataSourceId: text("data_source_id").notNull(),
    state: text("state")
      .$type<StructureState>()
      .notNull()
      .default("pending"),
    payload: text("payload"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    syncedAt: integer("synced_at", { mode: "timestamp_ms" }),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }).notNull(),
    leaseUntil: integer("lease_until", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("data_source_structure_source_unique").on(table.dataSourceId),
    // The sweeper asks "what is waiting, is due, and is unclaimed" once a tick.
    index("data_source_structure_state_next_attempt_idx").on(
      table.state,
      table.nextAttemptAt,
    ),
  ],
);

export type DataSourceStructureRow = typeof dataSourceStructure.$inferSelect;

export type NewDataSourceStructureRow = typeof dataSourceStructure.$inferInsert;
