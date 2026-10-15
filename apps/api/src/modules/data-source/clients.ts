import { createConnection } from "mysql2/promise";
import { createClient as createRedisClient } from "redis";
import { createClient as createClickhouseClient } from "@clickhouse/client-web";
import { MongoClient, Binary, Decimal128, Long, ObjectId } from "mongodb";
import {
  createClient as createLibsqlClient,
  type Client as LibsqlClient,
} from "@libsql/client";
import {
  databaseName,
  endpointAddress,
  tcpAddress,
  type IStoredConnection,
} from "./connection";
import { jsonValue } from "../../common/http/json-value";

export const STATEMENT_TIMEOUT_MS = 15000;

const MAX_SCAN_KEYS = 500;

const MAX_VALUE_CHARS = 100_000;

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export { SAFE_IDENTIFIER, MAX_SCAN_KEYS, MAX_VALUE_CHARS };

export function assertIdentifier(value: string): void {
  if (!SAFE_IDENTIFIER.test(value)) {
    throw new Error(`Rejected identifier: ${value}`);
  }
}

export function quotePostgres(value: string): string {
  assertIdentifier(value);
  return `"${value}"`;
}

export function quoteMysql(value: string): string {
  assertIdentifier(value);
  return `\`${value}\``;
}

export function toRows(
  rows: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return rows.map((row) => jsonValue(row) as Record<string, unknown>);
}

// MongoDB documents arrive holding BSON values, so their types have to be read
// off the driver's classes rather than off JavaScript's.
export function bsonTypeName(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (value instanceof ObjectId) {
    return "objectId";
  }
  if (value instanceof Long) {
    return "long";
  }
  if (value instanceof Decimal128) {
    return "decimal";
  }
  if (value instanceof Binary) {
    return "binary";
  }
  if (value instanceof Date) {
    return "date";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  switch (typeof value) {
    case "string":
      return "string";
    case "boolean":
      return "bool";
    case "number":
      return Number.isInteger(value) ? "int" : "double";
    default:
      return "object";
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

export function openMysql(connection: IStoredConnection) {
  return createConnection(mysqlOptions(connection));
}

// MongoDB takes a URL. A tls source is a direct host reached over TLS; the
// driver resolves mongodb+srv itself, and a split host/port cannot round-trip
// one, so only mongodb:// is accepted when the source is created.
export function openMongo(connection: IStoredConnection): MongoClient {
  const { host, port } = tcpAddress(connection);
  const credentials =
    connection.username === null
      ? ""
      : `${encodeURIComponent(connection.username)}:${encodeURIComponent(connection.password ?? "")}@`;
  // `options` is the connection string's own query — authSource, replicaSet —
  // kept verbatim so a pasted URL keeps working.
  const query = new URLSearchParams(
    connection.options === null
      ? []
      : connection.options.split("&").map((pair) => pair.split("=")),
  );
  if (connection.connectionMode === "tls") {
    query.set("tls", "true");
  }
  const search = query.toString();
  return new MongoClient(
    `mongodb://${credentials}${host}:${port}/${encodeURIComponent(databaseName(connection))}` +
      (search.length === 0 ? "" : `?${search}`),
    { serverSelectionTimeoutMS: STATEMENT_TIMEOUT_MS },
  );
}

export function clickhouseClient(connection: IStoredConnection, limit: number) {
  const overTls = connection.connectionMode === "tls";
  const address = tcpAddress(connection);
  return createClickhouseClient({
    url: `${overTls ? "https" : "http"}://${address.host}:${address.port}`,
    username: connection.username ?? undefined,
    password: connection.password ?? undefined,
    database: connection.database ?? undefined,
    clickhouse_settings: {
      readonly: "1",
      max_execution_time: Math.ceil(STATEMENT_TIMEOUT_MS / 1000),
      max_result_rows: String(limit),
    },
  });
}

export async function redisClient(connection: IStoredConnection) {
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

function libsqlOptions(connection: IStoredConnection) {
  const { url, token } = endpointAddress(connection);
  return { url, ...(token === null ? {} : { authToken: token }) };
}

// A SQLite source is a file path on Node and a libsql:// URL on Workers.
function sqliteUrl(connection: IStoredConnection): { url: string } {
  const database = databaseName(connection);
  return {
    url:
      database.startsWith("libsql:") || database.startsWith("http")
        ? database
        : `file:${database}`,
  };
}

export function libsqlClientFor(connection: IStoredConnection): LibsqlClient {
  return createLibsqlClient(
    connection.kind === "sqlite" ? sqliteUrl(connection) : libsqlOptions(connection),
  );
}
