import { randomUUID } from "node:crypto";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const dataSource = sqliteTable("data_source", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id").notNull(),
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
});

export type DataSourceRow = typeof dataSource.$inferSelect;

export type NewDataSourceRow = typeof dataSource.$inferInsert;
