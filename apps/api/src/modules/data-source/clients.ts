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
  redisAddress,
  tcpAddress,
  type IStoredConnection,
} from "./connection";
import { jsonValue } from "../../common/http/json-value";

export const STATEMENT_TIMEOUT_MS = 30_000;

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

export function openMongo(connection: IStoredConnection): MongoClient {
  const { host, port } = tcpAddress(connection);
  const credentials =
    connection.username === null
      ? ""
      : `${encodeURIComponent(connection.username)}:${encodeURIComponent(connection.password ?? "")}@`;
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
  const client = createRedisClient({
    url: redisAddress(connection),
    socket: { connectTimeout: STATEMENT_TIMEOUT_MS },
  });
  await client.connect();
  return client;
}

function libsqlOptions(connection: IStoredConnection) {
  const { url, token } = endpointAddress(connection);
  return { url, ...(token === null ? {} : { authToken: token }) };
}

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
