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
import { applyBudget, DEFAULT_RESULT_BUDGET } from "./budget";
import { composeStatement, dialectOf } from "./compose";
import { assertSqlReads } from "./read-policy";
import type { IQueryRefine, IQueryResponse } from "./contracts";

const MYSQL_TYPE_NAMES = new Map<number, string>(
  Object.entries(mysql.Types)
    .filter(([key]) => Number.isInteger(Number(key)))
    .map(([key, name]) => [Number(key), String(name)]),
);

export async function runSqlQuery(
  connection: IStoredConnection,
  sql: string,
  readOnly: boolean,
  refine: IQueryRefine | null = null,
): Promise<IQueryResponse> {
  const statement = sql.trim().replace(/;+\s*$/, "");
  if (statement.length === 0) {
    throw new BadRequestException("Write a statement to run");
  }
  if (readOnly) {
    assertSqlReads(statement, "run");
  }
  const dialect = dialectOf(connection.kind);
  if (dialect === null) {
    throw new BadRequestException(
      "Running statements on that kind of source is not available yet",
    );
  }
  const composed = composeStatement(statement, refine, dialect);

  switch (connection.kind) {
    case "postgres":
      return runPostgresQuery(asRelational(connection, readOnly), composed);
    case "mysql":
    case "mariadb":
      return runMysqlStatement(connection, composed);
    case "clickhouse":
      return runClickhouseStatement(connection, composed);
    case "sqlite":
    case "libsql":
      return runSqliteStatement(connection, composed);
    default:
      throw new BadRequestException(
        "Running statements on that kind of source is not available yet",
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
    const budgeted = applyBudget(typed);
    const columns = (fields ?? []).map((field) => field.name);
    return {
      columns,
      columnTypes: (fields ?? []).map(
        (field) => MYSQL_TYPE_NAMES.get(field.type ?? 0) ?? "UNKNOWN",
      ),
      rows: budgeted.rows,
      rowCount: typed.length,
      truncated: budgeted.truncated,
      durationMs: Date.now() - startedAt,
      statement,
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
  const client = clickhouseClient(connection, DEFAULT_RESULT_BUDGET.maxRows);
  const startedAt = Date.now();
  try {
    const result = await client.query({ query: statement, format: "JSON" });
    const payload = (await result.json()) as {
      meta?: Array<{ name: string; type: string }>;
      data: Array<Record<string, unknown>>;
    };
    const rows = toRows(payload.data ?? []);
    const budgeted = applyBudget(rows);
    return {
      columns: (payload.meta ?? []).map((entry) => entry.name),
      columnTypes: (payload.meta ?? []).map((entry) => entry.type),
      rows: budgeted.rows,
      rowCount: rows.length,
      truncated: budgeted.truncated,
      durationMs: Date.now() - startedAt,
      statement,
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
    const budgeted = applyBudget(rows);
    return {
      columns: result.columns,
      columnTypes: result.columnTypes,
      rows: budgeted.rows,
      rowCount: rows.length,
      truncated: budgeted.truncated,
      durationMs: Date.now() - startedAt,
      statement,
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
