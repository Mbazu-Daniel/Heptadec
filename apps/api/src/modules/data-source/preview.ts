import {
  asRelational,
  databaseName,
  type IStoredConnection,
} from "./connection";
import {
  quickwitIndexes,
  quickwitSearch,
} from "./quickwit-client";
import {
  MAX_SCAN_KEYS,
  MAX_VALUE_CHARS,
  SAFE_IDENTIFIER,
  STATEMENT_TIMEOUT_MS,
  assertIdentifier,
  clickhouseClient,
  libsqlClientFor,
  openMongo,
  openMysql,
  quoteMysql,
  quotePostgres,
  redisClient,
  toRows,
} from "./clients";
import {
  postgresClient,
} from "./postgres-client";
import type { DataSourceKind } from "./contracts";
import type { IPreviewObject, IPreviewResponse } from "./contracts";

export const PREVIEW_DEFAULT_LIMIT = 50;

export const PREVIEW_MAX_LIMIT = 100;

const MAX_LIMIT = 100;

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

async function listMysqlTables(connection: IStoredConnection): Promise<IPreviewObject[]> {
  const client = await openMysql(connection);
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
  const client = await openMysql(connection);
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
  const client = libsqlClientFor(connection);
  try {
    const result = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    return result.rows
      .map((row) => String((row as Record<string, unknown>).name ?? ""))
      .filter((name) => SAFE_IDENTIFIER.test(name))
      .map((name) => ({ name, type: "table" as const }));
  } finally {
    client.close();
  }
}

async function previewSqliteTable(
  connection: IStoredConnection,
  table: string,
  limit: number,
): Promise<IPreviewResponse> {
  assertIdentifier(table);
  const client = libsqlClientFor(connection);
  try {
    const result = await client.execute({
      sql: `SELECT * FROM "${table}" LIMIT ?`,
      args: [limit],
    });
    const rows = toRows(result.rows as Array<Record<string, unknown>>);
    return {
      columns: result.columns,
      rows,
      truncated: rows.length >= limit,
    };
  } finally {
    client.close();
  }
}

async function listLibsqlTables(connection: IStoredConnection): Promise<IPreviewObject[]> {
  const client = libsqlClientFor(connection);
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
  const client = libsqlClientFor(connection);
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

async function listQuickwitIndexes(connection: IStoredConnection): Promise<IPreviewObject[]> {
  const indexes = await quickwitIndexes(connection);
  return indexes.map((name) => ({ name, type: "index" as const }));
}

async function previewQuickwitIndex(
  connection: IStoredConnection,
  index: string,
  query: string,
  limit: number,
): Promise<IPreviewResponse> {
  const search = await quickwitSearch(connection, index, query, limit);
  const rows = toRows(search.documents);
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  return { columns, rows, truncated: search.truncated };
}


async function listMongoCollections(
  connection: IStoredConnection,
): Promise<IPreviewObject[]> {
  const client = openMongo(connection);
  try {
    const found = await client
      .db(databaseName(connection))
      .listCollections(undefined, { nameOnly: true })
      .toArray();
    return found
      .map((entry) => entry.name)
      .filter((name) => name.length > 0 && !name.startsWith("system."))
      .sort()
      .map((name) => ({ name, type: "collection" as const }));
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function previewMongoCollection(
  connection: IStoredConnection,
  name: string,
  limit: number,
): Promise<IPreviewResponse> {
  const client = openMongo(connection);
  try {
    const documents = await client
      .db(databaseName(connection))
      .collection(name)
      .find({}, { limit: limit + 1 })
      .toArray();
    const rows = toRows(documents.slice(0, limit).map((document) => document as Record<string, unknown>));
    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    return { columns, rows, truncated: documents.length > limit };
  } finally {
    await client.close().catch(() => undefined);
  }
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
  mongodb: { list: listMongoCollections, preview: named(previewMongoCollection) },
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
