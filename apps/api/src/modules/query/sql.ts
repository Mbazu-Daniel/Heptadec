import mysql from "mysql2";
import { BadRequestException } from "../../common/exceptions";
import {
  clickhouseClient,
  libsqlClientFor,
  openMysql,
  toRows,
} from "../data-source/clients";
import type { IStoredConnection } from "../data-source/connection";
import { asRelational } from "../data-source/connection";
import { runPostgresQuery } from "./postgres";
import type { IQueryResponse } from "./contracts";

const MAX_ROWS = 10_000;

const MAX_BYTES = 5 * 1024 * 1024;

const READ_ONLY_START = /^\s*(select|with|show|describe|desc|explain|pragma|values)\b/i;

const MYSQL_TYPE_NAMES = new Map<number, string>(
  Object.entries(mysql.Types)
    .filter(([key]) => Number.isInteger(Number(key)))
    .map(([key, name]) => [Number(key), String(name)]),
);

export async function runSqlQuery(
  connection: IStoredConnection,
  sql: string,
  readOnly: boolean,
): Promise<IQueryResponse> {
  const statement = sql.trim().replace(/;+\s*$/, "");
  if (statement.length === 0) {
    throw new BadRequestException("Write a statement to run");
  }
  if (readOnly && connection.kind !== "postgres") {
    assertReadOnly(statement);
  }

  switch (connection.kind) {
    case "postgres":
      return runPostgresQuery(asRelational(connection, readOnly), statement);
    case "mysql":
    case "mariadb":
      return runMysqlStatement(connection, statement);
    case "clickhouse":
      return runClickhouseStatement(connection, statement);
    case "sqlite":
    case "libsql":
      return runSqliteStatement(connection, statement);
    default:
      throw new BadRequestException(
        "Running statements on that kind of source is not available yet",
      );
  }
}

function assertReadOnly(statement: string): void {
  if (!READ_ONLY_START.test(statement)) {
    throw new BadRequestException(
      "Only read-only statements can run here — that one writes",
    );
  }
}

async function runMysqlStatement(
  connection: IStoredConnection,
  statement: string,
): Promise<IQueryResponse> {
  const client = await openMysql(connection);
  const startedAt = Date.now();
  try {
    const [rows, fields] = await client.query(statement);
    const typed = toRows(rows as Array<Record<string, unknown>>);
    const columns = (fields ?? []).map((field) => field.name);
    return {
      columns,
      columnTypes: (fields ?? []).map(
        (field) => MYSQL_TYPE_NAMES.get(field.type ?? 0) ?? "UNKNOWN",
      ),
      rows: typed.slice(0, MAX_ROWS),
      rowCount: typed.length,
      truncated: typed.length > MAX_ROWS || tooManyBytes(typed),
      durationMs: Date.now() - startedAt,
    };
  } catch (caught) {
    throw refused(caught);
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function runClickhouseStatement(
  connection: IStoredConnection,
  statement: string,
): Promise<IQueryResponse> {
  const client = clickhouseClient(connection, MAX_ROWS);
  const startedAt = Date.now();
  try {
    const result = await client.query({ query: statement, format: "JSON" });
    const payload = (await result.json()) as {
      meta?: Array<{ name: string; type: string }>;
      data: Array<Record<string, unknown>>;
    };
    const rows = toRows(payload.data ?? []);
    return {
      columns: (payload.meta ?? []).map((entry) => entry.name),
      columnTypes: (payload.meta ?? []).map((entry) => entry.type),
      rows: rows.slice(0, MAX_ROWS),
      rowCount: rows.length,
      truncated: rows.length > MAX_ROWS || tooManyBytes(rows),
      durationMs: Date.now() - startedAt,
    };
  } catch (caught) {
    throw refused(caught);
  } finally {
    await client.close().catch(() => undefined);
  }
}

async function runSqliteStatement(
  connection: IStoredConnection,
  statement: string,
): Promise<IQueryResponse> {
  const client = libsqlClientFor(connection);
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const run = client.execute(statement);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("statement timeout")),
        15000,
      );
    });
    const result = await Promise.race([run, timeout]);
    const rows = toRows(result.rows as unknown as Array<Record<string, unknown>>);
    return {
      columns: result.columns,
      columnTypes: result.columnTypes,
      rows: rows.slice(0, MAX_ROWS),
      rowCount: rows.length,
      truncated: rows.length > MAX_ROWS || tooManyBytes(rows),
      durationMs: Date.now() - startedAt,
    };
  } catch (caught) {
    throw refused(caught);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    client.close();
  }
}

function tooManyBytes(rows: Array<Record<string, unknown>>): boolean {
  return JSON.stringify(rows).length > MAX_BYTES;
}

function refused(caught: unknown): BadRequestException {
  const message = caught instanceof Error ? caught.message : "";
  if (message.includes("timeout")) {
    return new BadRequestException("That statement took too long and was cancelled");
  }
  if (message.includes("ECONNREFUSED")) {
    return new BadRequestException("Nothing is listening on that host and port");
  }
  console.error(`[api] that source refused a statement: ${message}`);
  return new BadRequestException(
    "That statement was refused. Check the tables and columns it names exist and that you can read them.",
  );
}
