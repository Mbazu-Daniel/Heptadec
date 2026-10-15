import { BadRequestException } from "../../common/exceptions";
import { quickwitSearch } from "../data-source/quickwit-client";
import { toRows } from "../data-source/clients";
import type { IStoredConnection } from "../data-source/connection";
import type { ISearchStatement, IQueryResponse } from "./contracts";

const MAX_ROWS = 10_000;

/**
 * Read the search a request carries. A source stores nothing about how it was
 * searched, so the index and the query arrive whole and are checked here rather
 * than trusting the shape the browser sent.
 */
export function readSearchStatement(value: unknown): ISearchStatement {
  if (typeof value !== "object" || value === null) {
    throw new BadRequestException("A search is required");
  }
  const body = value as Record<string, unknown>;

  const index = body.index;
  if (typeof index !== "string" || index.trim().length === 0) {
    throw new BadRequestException("Pick an index to search");
  }

  const query = body.query;
  if (typeof query !== "string" || query.trim().length === 0) {
    throw new BadRequestException("Write a search to run");
  }

  return { index: index.trim(), query: query.trim() };
}

/**
 * Run one search over one index, and answer with a Grid like any other Run.
 *
 * A search is the one Run that has to name what it is over, because Quickwit
 * holds many indexes and none of them is the source — so the index travels with
 * the statement rather than being remembered from a connection.
 */
export async function runSearchQuery(
  connection: IStoredConnection,
  statement: { index: string; query: string },
): Promise<IQueryResponse> {
  const startedAt = performance.now();
  const search = await quickwitSearch(
    connection,
    statement.index,
    statement.query,
    MAX_ROWS,
  );

  const rows = toRows(search.documents);
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  return {
    columns,
    rows,
    truncated: search.truncated,
    columnTypes: columns.map(() => "string"),
    rowCount: rows.length,
    durationMs: Math.round(performance.now() - startedAt),
  };
}