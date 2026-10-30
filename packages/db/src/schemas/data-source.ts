import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization/organization";

export const dataSource = sqliteTable(
  "data_source",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    host: text("host"),
    port: integer("port"),
    socketPath: text("socket_path"),
    connectionMode: text("connection_mode"),
    database: text("database"),
    schemaName: text("schema_name"),
    options: text("options"),
    username: text("username"),
    secret: text("secret"),
    caCertificate: text("ca_certificate"),
    clientCertificate: text("client_certificate"),
    clientKey: text("client_key"),
    token: text("token"),
    readOnly: integer("read_only", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("data_source_organization_created_idx").on(table.organizationId, table.createdAt),
  ],
);

export type DataSourceRow = typeof dataSource.$inferSelect;

export type NewDataSourceRow = typeof dataSource.$inferInsert;
