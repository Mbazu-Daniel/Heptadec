import { BadRequestException } from "../../common/exceptions";
import type { SqlDialect } from "../data-source/contracts";
import type { IStoredConnection } from "../data-source/connection";
import type { FilterOp, IQueryFilter, IQueryRefine, IQuerySort } from "./contracts";

const MAX_COLUMN = 128;

const MAX_VALUE = 1_024;

const FILTER_OPS: Record<string, FilterOp> = {
  "=": "=",
  "<>": "<>",
  ">": ">",
  ">=": ">=",
  "<": "<",
  "<=": "<=",
  contains: "contains",
  "is null": "is null",
  "is not null": "is not null",
};

export function dialectOf(kind: IStoredConnection["kind"]): SqlDialect | null {
  switch (kind) {
    case "postgres":
      return "postgres";
    case "mysql":
    case "mariadb":
      return "mysql";
    case "clickhouse":
      return "clickhouse";
    case "sqlite":
    case "libsql":
      return "sqlite";
    default:
      return null;
  }
}

export function readQueryRefine(body: Record<string, unknown>): IQueryRefine | null {
  const raw = body.refine;
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new BadRequestException("That result refinement is not readable");
  }
  const entry = raw as Record<string, unknown>;
  const filter = readFilter(entry.filter);
  const sort = readSort(entry.sort);
  return filter === null && sort === null ? null : { filter, sort };
}

function readFilter(raw: unknown): IQueryFilter | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new BadRequestException("That filter is not readable");
  }
  const entry = raw as Record<string, unknown>;
  const column = typeof entry.column === "string" ? entry.column.trim() : "";
  if (column.length === 0 || column.length > MAX_COLUMN) {
    throw new BadRequestException("That filter needs one column");
  }
  const op = typeof entry.op === "string" ? FILTER_OPS[entry.op] : undefined;
  if (op === undefined) {
    throw new BadRequestException("That filter operator is not one this app knows");
  }
  const value = typeof entry.value === "string" ? entry.value : "";
  if (value.length > MAX_VALUE) {
    throw new BadRequestException("That filter value is too long");
  }
  return { column, op, value };
}

function readSort(raw: unknown): IQuerySort | null {
  if (raw === undefined || raw === null) {
    return null;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new BadRequestException("That sort is not readable");
  }
  const entry = raw as Record<string, unknown>;
  const column = typeof entry.column === "string" ? entry.column.trim() : "";
  if (column.length === 0 || column.length > MAX_COLUMN) {
    throw new BadRequestException("That sort needs one column");
  }
  if (entry.dir !== "asc" && entry.dir !== "desc") {
    throw new BadRequestException("That sort direction must be ascending or descending");
  }
  return { column, dir: entry.dir };
}

export function composeStatement(
  base: string,
  refine: IQueryRefine | null,
  dialect: SqlDialect,
): string {
  const filter = refine?.filter ?? null;
  const sort = refine?.sort ?? null;
  if (filter === null && sort === null) {
    return base;
  }

  const inner = base.replace(/;+\s*$/, "").trim();
  let statement = `SELECT * FROM (${inner}) AS heptadec_filtered`;
  if (filter !== null) {
    const column = quoteIdentifier(dialect, filter.column);
    if (filter.op === "is null" || filter.op === "is not null") {
      statement += ` WHERE ${column} ${filter.op === "is null" ? "IS NULL" : "IS NOT NULL"}`;
    } else if (filter.op === "contains") {
      statement += ` WHERE ${castToText(dialect, column)} LIKE ${quoteLiteral(`%${filter.value}%`)}`;
    } else {
      statement += ` WHERE ${column} ${filter.op} ${quoteLiteral(filter.value)}`;
    }
  }
  if (sort !== null) {
    statement += ` ORDER BY ${quoteIdentifier(dialect, sort.column)} ${sort.dir === "asc" ? "ASC" : "DESC"}`;
  }
  return `${statement} LIMIT 100`;
}

function quoteIdentifier(dialect: SqlDialect, name: string): string {
  if (dialect === "mysql" || dialect === "clickhouse") {
    return `\`${name.replace(/`/g, "``")}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

function castToText(dialect: SqlDialect, column: string): string {
  if (dialect === "clickhouse") {
    return `toString(${column})`;
  }
  if (dialect === "mysql") {
    return `CAST(${column} AS CHAR)`;
  }
  return `CAST(${column} AS TEXT)`;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
