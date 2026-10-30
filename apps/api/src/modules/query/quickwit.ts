import { BadRequestException } from "../../common/exceptions";
import { isJsonObject } from "../../common/http/body";
import { quickwitSearch } from "../data-source/quickwit-client";
import { toRows } from "../data-source/clients";
import type { IStoredConnection } from "../data-source/connection";
import type { ISearchStatement, IQueryResponse } from "./contracts";
import { applyBudget, DEFAULT_RESULT_BUDGET } from "./budget";

export function readSearchStatement(value: unknown): ISearchStatement {
  if (!isJsonObject(value)) {
    throw new BadRequestException("A search is required");
  }
  const body = value;

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

export async function runSearchQuery(
  connection: IStoredConnection,
  statement: { index: string; query: string },
): Promise<IQueryResponse> {
  const startedAt = performance.now();
  const search = await quickwitSearch(
    connection,
    statement.index,
    statement.query,
    DEFAULT_RESULT_BUDGET.maxRows,
  );

  const rows = toRows(search.documents);
  const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const budgeted = applyBudget(rows);

  return {
    columns,
    rows: budgeted.rows,
    truncated: search.truncated || budgeted.truncated,
    columnTypes: columns.map(() => "string"),
    rowCount: budgeted.rows.length,
    durationMs: Math.round(performance.now() - startedAt),
  };
}