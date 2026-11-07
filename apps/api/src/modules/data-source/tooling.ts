import type { DataSourceRow } from "@heptadec/db";
import type { IQueryResponse } from "../query/contracts";
import { assertSqlReads, type ReadPurpose } from "../query/read-policy";
import { runSqlQuery } from "../query/engines/sql";
import type { Introspected } from "../schema/introspect";
import { introspectSchema } from "../schema/introspect";
import { storedFromRow } from "./connection";

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
