import type { DataSourceRow } from "@heptadec/db";
import type { IQueryResponse } from "../query/contracts";
import { assertSqlReads, type ReadPurpose } from "../query/read-policy";
import { runSqlQuery } from "../query/sql";
import type { Introspected } from "../schema/introspect";
import { introspectSchema } from "../schema/introspect";
import { storedFromRow } from "./connection";

/**
 * The app's own way of reading a source.
 *
 * Charts, saved-query caches, and the MCP tools all read on the user's behalf,
 * and all came through Postgres directly — right only until another engine
 * became describable. They come through here instead, so the engine named by the
 * stored kind decides how the read is done and the read-only floor is decided
 * once: the connection is forced read-only and the statement is checked before
 * any driver sees it.
 */
export async function runReadOnly(
  source: DataSourceRow,
  statement: string,
  purpose: ReadPurpose,
): Promise<IQueryResponse> {
  assertSqlReads(statement, purpose);
  return runSqlQuery(
    { ...(await storedFromRow(source)), readOnly: true },
    statement,
  );
}

export async function readStructure(
  source: DataSourceRow,
): Promise<Introspected> {
  return introspectSchema(await storedFromRow(source));
}
