import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization/organization";

export const apikey = sqliteTable(
  "api_key",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    configId: text("config_id")
      .notNull()
      .default("default"),
    name: text("name"),
    start: text("start"),
    referenceId: text("reference_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    prefix: text("prefix"),
    key: text("key").notNull(),
    refillInterval: integer("refill_interval"),
    refillAmount: integer("refill_amount"),
    lastRefillAt: integer("last_refill_at", { mode: "timestamp_ms" }),
    enabled: integer("enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    rateLimitEnabled: integer("rate_limit_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    rateLimitTimeWindow: integer("rate_limit_time_window"),
    rateLimitMax: integer("rate_limit_max"),
    requestCount: integer("request_count").notNull().default(0),
    remaining: integer("remaining"),
    lastRequest: integer("last_request", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    permissions: text("permissions"),
    metadata: text("metadata"),
  },
  (table) => [
    index("api_key_reference_id_idx").on(table.referenceId),
    index("api_key_config_id_idx").on(table.configId),
  ],
);

export type ApiKeyRow = typeof apikey.$inferSelect;

export type NewApiKeyRow = typeof apikey.$inferInsert;
