import mysql from "mysql2";
import { BadRequestException } from "../../common/exceptions";
import { driverFailure } from "../../common/driver-error";
import {
  clickhouseClient,
  libsqlClientFor,
  openMysql,
  toRows,
} from "../data-source/clients";
import type { IStoredConnection } from "../data-source/connection";
import { asRelational } from "../data-source/connection";
import { engineFrom, type SqlDialect } from "../data-source/contracts";
import { runPostgresQuery } from "./postgres";
import { applyBudget, DEFAULT_RESULT_BUDGET } from "./budget";
import { composeStatement } from "./compose";
import { assertSqlReads } from "./read-policy";
import type { IQueryRefine, IQueryResponse } from "./contracts";

const MYSQL_TYPE_NAMES = new Map<number, string>(
  Object.entries(mysql.Types)
    .filter(([key]) => Number.isInteger(Number(key)))
    .map(([key, name]) => [Number(key), String(name)]),
);

type SqlRunner = (
  connection: IStoredConnection,
  statement: string,
) => Promise<IQueryResponse>;

/**
 * Which dialect runs a statement, not which engine asked for it: MariaDB speaks
 * MySQL and libsql speaks SQLite, so an engine inherits its runner by naming a
 * dialect in the catalog rather than by being listed here.
 *
 * Keyed by the dialect union, so a dialect added later stops compiling until
 * its runner exists, instead of reaching a throwing default at runtime.
 */
const SQL_RUNNERS: Record<SqlDialect, SqlRunner> = {
  postgres: (connection, statement) =>
    runPostgresQuery(asRelational(connection), statement),
  mysql: runMysqlStatement,
  clickhouse: runClickhouseStatement,
  sqlite: runSqliteStatement,
};

export async function runSqlQuery(
  connection: IStoredConnection,
  sql: string,
  refine: IQueryRefine | null = null,
): Promise<IQueryResponse> {
  const statement = sql.trim().replace(/;+\s*$/, "");
  if (statement.length === 0) {
    throw new BadRequestException("Write a statement to run");
  }
  if (connection.readOnly) {
    assertSqlReads(statement, "run");
  }
  const dialect = engineFrom(connection.kind).sqlDialect;
  if (dialect === null) {
    throw new BadRequestException(
      "Running statements on that kind of source is not available yet",
    );
  }
  const composed = composeStatement(statement, refine, dialect);
  return SQL_RUNNERS[dialect](connection, composed);
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
  const failure = driverFailure(caught, "run that statement");
  if (failure !== null) {
    return new BadRequestException(failure);
  }
  const message = caught instanceof Error ? caught.message : "";
  if (message.includes("timeout")) {
    return new BadRequestException("That statement took too long and was cancelled");
  }
  return new BadRequestException(
    "That statement was refused. Check the tables and columns it names exist and that you can read them.",
  );
}
