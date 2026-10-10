import { createConnection } from "mysql2/promise";
import { createClient as createRedisClient } from "redis";
import { createClient as createClickhouseClient } from "@clickhouse/client";
import { createClient as createLibsqlClient } from "@libsql/client";
import { DatabaseSync } from "node:sqlite";
import {
  asRelational,
  databaseName,
  endpointAddress,
  tcpAddress,
  type IStoredConnection,
} from "./connection";
import { jsonValue } from "../../common/http/json-value";
import { postgresClient } from "./postgres-client";
import type { DataSourceKind } from "./contracts";
import type { IPreviewObject, IPreviewResponse } from "./contracts";

export const PREVIEW_DEFAULT_LIMIT = 50;

export const PREVIEW_MAX_LIMIT = 100;

const STATEMENT_TIMEOUT_MS = 15000;

const MAX_LIMIT = 100;

const MAX_SCAN_KEYS = 500;

const MAX_VALUE_CHARS = 100_000;

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function assertIdentifier(value: string): void {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(`Rejected identifier: ${value}`);
  }
}

function quotePostgres(value: string): string {
  assertIdentifier(value);
  return `"${value}"`;
}

function quoteMysql(value: string): string {
  assertIdentifier(value);
  return `\`${value}\``;
}

function toRows(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((row) => jsonValue(row) as Record<string, unknown>);
}

async function listPostgresTables(connection: IStoredConnection): Promise<IPreviewObject[]> {
  const client = postgresClient(asRelational(connection, true), "heptadec-preview");
  await client.connect();
  try {
    const result = await client.query(
      "SELECT schemaname AS schema, tablename AS name FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema') ORDER BY schemaname, tablename",
    );
    return (result.rows as Array<{ schema: string; name: string }>).map((row) => ({
      name: `${row.schema}.${row.name}`,
      type: "table",
    }));
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function previewPostgresTable(
  connection: IStoredConnection,
  schema: string,
  table: string,
  limit: number,
): Promise<IPreviewResponse> {
  const client = postgresClient(asRelational(connection, true), "heptadec-preview");
  await client.connect();
  try {
    const result = await client.query(
      `SELECT * FROM ${quotePostgres(schema)}.${quotePostgres(table)} LIMIT $1`,
      [limit],
    );
    const rows = toRows(result.rows as Array<Record<string, unknown>>);
    return {
      columns: result.fields.map((field) => field.name),
      rows,
      truncated: rows.length >= limit,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

function mysqlOptions(connection: IStoredConnection) {
  const address =
    connection.socketPath === null
      ? tcpAddress(connection)
      : { socketPath: connection.socketPath };
  return {
    ...address,
    database: databaseName(connection),
    user: connection.username ?? "",
    password: connection.password ?? undefined,
    ...(connection.clientCert === null
      ? {}
      : {
          ssl: {
            ca: connection.caCert ?? undefined,
            cert: connection.clientCert,
            key: connection.clientKey ?? undefined,
          },
        }),
    connectTimeout: STATEMENT_TIMEOUT_MS,
  };
}

async function listMysqlTables(connection: IStoredConnection): Promise<IPreviewObject[]> {
  const client = await createConnection(mysqlOptions(connection));
  try {
    const [rows] = await client.query(
      "SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
      [databaseName(connection)],
    );
    return (rows as Array<{ name: string }>)
      .filter((row) => SAFE_IDENTIFIER.test(row.name))
      .map((row) => ({ name: row.name, type: "table" }));
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function previewMysqlTable(
  connection: IStoredConnection,
  table: string,
  limit: number,
): Promise<IPreviewResponse> {
  const client = await createConnection(mysqlOptions(connection));
  try {
    const [rows] = await client.query(
      `SELECT * FROM ${quoteMysql(table)} LIMIT ${limit}`,
    );
    const typed = toRows(rows as Array<Record<string, unknown>>);
    return {
      columns: typed.length > 0 ? Object.keys(typed[0]!) : [],
      rows: typed,
      truncated: typed.length >= limit,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function listSqliteTables(connection: IStoredConnection): Promise<IPreviewObject[]> {
  const database = new DatabaseSync(databaseName(connection), { readOnly: true });
  try {
    const rows = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    return rows
      .filter((row) => SAFE_IDENTIFIER.test(row.name))
      .map((row) => ({ name: row.name, type: "table" }));
  } finally {
    database.close();
  }
}

async function previewSqliteTable(
  connection: IStoredConnection,
  table: string,
  limit: number,
): Promise<IPreviewResponse> {
  assertIdentifier(table);
  const database = new DatabaseSync(databaseName(connection), { readOnly: true });
  try {
    const rows = toRows(
      database
        .prepare(`SELECT * FROM "${table}" LIMIT ?`)
        .all(limit) as Array<Record<string, unknown>>,
    );
    return {
      columns: rows.length > 0 ? Object.keys(rows[0]!) : [],
      rows,
      truncated: rows.length >= limit,
    };
  } finally {
    database.close();
  }
}

async function listLibsqlTables(connection: IStoredConnection): Promise<IPreviewObject[]> {
  const client = createLibsqlClient(libsqlOptions(connection));
  try {
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    return result.rows
      .map((row) => String((row as Record<string, unknown>).name ?? ""))
      .filter((name) => SAFE_IDENTIFIER.test(name))
      .map((name) => ({ name, type: "table" }));
  } finally {
    client.close();
  }
}

async function previewLibsqlTable(
  connection: IStoredConnection,
  table: string,
  limit: number,
): Promise<IPreviewResponse> {
  assertIdentifier(table);
  const client = createLibsqlClient(libsqlOptions(connection));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = client.execute({
      sql: `SELECT * FROM "${table}" LIMIT ?`,
      args: [limit],
    });
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("The preview query timed out")), STATEMENT_TIMEOUT_MS);
    });
    const result = await Promise.race([run, timeout]);
    const rows = toRows(result.rows as Array<Record<string, unknown>>);
    return {
      columns: result.columns,
      rows,
      truncated: rows.length >= limit,
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    client.close();
  }
}

function libsqlOptions(connection: IStoredConnection) {
  const { url, token } = endpointAddress(connection);
  return { url, ...(token === null ? {} : { authToken: token }) };
}

function clickhouseTls(connection: IStoredConnection): {
  ca_cert: Buffer;
  cert?: Buffer;
  key?: Buffer;
} {
  return {
    ca_cert: Buffer.from(connection.caCert ?? ""),
    ...(connection.clientCert === null || connection.clientKey === null
      ? {}
      : {
          cert: Buffer.from(connection.clientCert),
          key: Buffer.from(connection.clientKey),
        }),
  };
}

function clickhouseClient(connection: IStoredConnection, limit: number) {
  const overTls = connection.connectionMode === "tls";
  const address = tcpAddress(connection);
  return createClickhouseClient({
    url: `${overTls ? "https" : "http"}://${address.host}:${address.port}`,
    username: connection.username ?? undefined,
    password: connection.password ?? undefined,
    database: connection.database ?? undefined,
    ...(overTls ? { tls: clickhouseTls(connection) } : {}),
    clickhouse_settings: {
      readonly: "1",
      max_execution_time: Math.ceil(STATEMENT_TIMEOUT_MS / 1000),
      max_result_rows: String(limit),
    },
  });
}

async function listClickhouseTables(connection: IStoredConnection): Promise<IPreviewObject[]> {
  const client = clickhouseClient(connection, MAX_LIMIT);
  try {
    const result = await client.query({
      query: "SELECT name FROM system.tables WHERE database = currentDatabase() ORDER BY name",
      format: "JSONEachRow",
    });
    const rows = (await result.json()) as Array<{ name: string }>;
    return rows
      .filter((row) => SAFE_IDENTIFIER.test(row.name))
      .map((row) => ({ name: row.name, type: "table" }));
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function previewClickhouseTable(
  connection: IStoredConnection,
  table: string,
  limit: number,
): Promise<IPreviewResponse> {
  const client = clickhouseClient(connection, limit);
  try {
    const result = await client.query({
      query: `SELECT * FROM ${quoteMysql(table)} LIMIT ${limit}`,
      format: "JSONEachRow",
    });
    const rows = toRows((await result.json()) as Array<Record<string, unknown>>);
    return {
      columns: rows.length > 0 ? Object.keys(rows[0]!) : [],
      rows,
      truncated: rows.length >= limit,
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function listRedisKeys(connection: IStoredConnection): Promise<IPreviewObject[]> {
  const client = await redisClient(connection);
  try {
    const keys: string[] = [];
    let cursor = "0";
    do {
      const scanned = await client.scan(cursor, { COUNT: 200 });
      cursor = String(scanned.cursor);
      keys.push(...scanned.keys);
    } while (cursor !== "0" && keys.length < MAX_SCAN_KEYS);
    return keys.slice(0, MAX_SCAN_KEYS).map((key) => ({ name: key, type: "key" as const }));
  } finally {
    await client.quit().catch(() => undefined);
  }
}

async function previewRedisKey(
  connection: IStoredConnection,
  key: string,
  limit: number,
): Promise<IPreviewResponse> {
  const client = await redisClient(connection);
  try {
    const type = await client.type(key);
    if (type === "string") {
      const value = await client.get(key);
      const text = (value ?? "").slice(0, MAX_VALUE_CHARS);
      return {
        columns: ["value"],
        rows: [{ value: text }],
        truncated: (value ?? "").length > MAX_VALUE_CHARS,
      };
    }
    if (type === "hash") {
      const fields = Object.entries(await client.hGetAll(key));
      const cut = fields.slice(0, limit + 1);
      return {
        columns: ["field", "value"],
        rows: cut.slice(0, limit).map(([field, value]) => ({ field, value })),
        truncated: cut.length > limit,
      };
    }
    if (type === "list") {
      const values = await client.lRange(key, 0, limit);
      return {
        columns: ["value"],
        rows: values.slice(0, limit).map((value) => ({ value })),
        truncated: values.length > limit,
      };
    }
    if (type === "set") {
      const members = await client.sMembers(key);
      return {
        columns: ["member"],
        rows: members.slice(0, limit).map((value) => ({ member: value })),
        truncated: members.length > limit,
      };
    }
    if (type === "zset") {
      const values = await client.zRangeWithScores(key, 0, limit);
      return {
        columns: ["member", "score"],
        rows: values
          .slice(0, limit)
          .map((entry) => ({ member: entry.value, score: entry.score })),
        truncated: values.length > limit,
      };
    }
    if (type === "stream") {
      const found = (await client.xRange(key, "-", "+", { COUNT: limit + 1 })) ?? [];
      return {
        columns: ["id", "fields"],
        rows: found.slice(0, limit).map((entry) => ({
          id: entry.id,
          fields: JSON.stringify(entry.message),
        })),
        truncated: found.length > limit,
      };
    }
    return { columns: [], rows: [], truncated: false };
  } finally {
    await client.quit().catch(() => undefined);
  }
}

async function redisClient(connection: IStoredConnection) {
  const { host, port } = tcpAddress(connection);
  const username = connection.username;
  const auth = connection.password
    ? `${username ? encodeURIComponent(username) : ""}:${encodeURIComponent(connection.password)}@`
    : username
      ? `${encodeURIComponent(username)}@`
      : "";
  const scheme = connection.connectionMode === "tls" ? "rediss" : "redis";
  const database =
    connection.database === null || connection.database === ""
      ? ""
      : `/${encodeURIComponent(connection.database)}`;
  const client = createRedisClient({
    url: `${scheme}://${auth}${host}:${port}${database}`,
    socket: { connectTimeout: STATEMENT_TIMEOUT_MS },
  });
  await client.connect();
  return client;
}

async function listQuickwitIndexes(connection: IStoredConnection): Promise<IPreviewObject[]> {
  const { url, token } = endpointAddress(connection);
  const indexes = (await quickwitFetch(url, token, "/api/v1/indexes")) as Array<{
    index_config: { index_id: string };
  }>;
  return indexes.map((index) => ({ name: index.index_config.index_id, type: "index" as const }));
}

async function previewQuickwitIndex(
  connection: IStoredConnection,
  index: string,
  query: string,
  limit: number,
): Promise<IPreviewResponse> {
  const { url, token } = endpointAddress(connection);
  const body = (await quickwitFetch(url, token, `/api/v1/${encodeURIComponent(index)}/search`, {
    method: "POST",
    body: JSON.stringify({ query, max_hits: limit }),
  })) as { hits: Array<{ _source: Record<string, unknown> }> };
  const rows = toRows(body.hits.map((hit) => hit._source));
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return { columns, rows, truncated: rows.length >= limit };
}

async function quickwitFetch(
  endpoint: string,
  token: string | null,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (token !== null) {
    headers.set("authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${endpoint.replace(/\/$/, "")}${path}`, {
    ...init,
    headers,
    signal: AbortSignal.timeout(STATEMENT_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Quickwit answered ${response.status}`);
  }
  return (await response.json()) as unknown;
}

interface IBrowser {
  list: (connection: IStoredConnection) => Promise<IPreviewObject[]>;
  preview: (
    connection: IStoredConnection,
    object: IPreviewObject,
    query: string,
    limit: number,
  ) => Promise<IPreviewResponse>;
}

const BROWSERS: Record<DataSourceKind, IBrowser> = {
  postgres: {
    list: listPostgresTables,
    preview: (connection, object, _query, limit) => {
      const [schema, table] = object.name.split(".");
      assertIdentifier(schema ?? "");
      assertIdentifier(table ?? "");
      return previewPostgresTable(connection, schema as string, table as string, limit);
    },
  },
  mysql: { list: listMysqlTables, preview: named(previewMysqlTable) },
  mariadb: { list: listMysqlTables, preview: named(previewMysqlTable) },
  sqlite: { list: listSqliteTables, preview: named(previewSqliteTable) },
  libsql: { list: listLibsqlTables, preview: named(previewLibsqlTable) },
  clickhouse: { list: listClickhouseTables, preview: named(previewClickhouseTable) },
  redis: { list: listRedisKeys, preview: named(previewRedisKey) },
  quickwit: {
    list: listQuickwitIndexes,
    preview: (connection, object, query, limit) =>
      previewQuickwitIndex(connection, object.name, query, limit),
  },
};

function named(
  read: (
    connection: IStoredConnection,
    name: string,
    limit: number,
  ) => Promise<IPreviewResponse>,
): IBrowser["preview"] {
  return (connection, object, _query, limit) =>
    read(connection, object.name, limit);
}

export async function listObjects(connection: IStoredConnection): Promise<IPreviewObject[]> {
  return BROWSERS[connection.kind].list(connection);
}

export async function previewObject(
  connection: IStoredConnection,
  object: IPreviewObject,
  query: string,
  limit: number,
): Promise<IPreviewResponse> {
  return BROWSERS[connection.kind].preview(connection, object, query, limit);
}
