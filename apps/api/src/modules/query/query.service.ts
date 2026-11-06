import { dataSource } from "@heptadec/db";

import { readBody, readString } from "../../common/http/body";
import { oneRow, type IOrganizationScope } from "../../common/session/current-organization";
import {
  BadRequestException,
  NotFoundException,
} from "../../common/exceptions/index";
import { engineOf } from "../data-source/engines";
import { savedConnection, storedFromRow } from "../data-source/connection";
import { explainPostgresQuery } from "./postgres";
import { runnerOf, type RunResult } from "./runners";
import type { IExplainResponse } from "./contracts";
import type {
  IExplainQueryInput,
  IRunQueryInput,
} from "./types";

export async function runQuery(
  organization: IOrganizationScope,
  dataSourceId: string,
  input: IRunQueryInput,
): Promise<RunResult> {
  const source = await oneRow(organization.db, dataSource, dataSourceId, organization);
  if (source === undefined) {
    throw new NotFoundException("That data source does not exist");
  }

  const runner = runnerOf(engineOf(source));
  const body = await runner.run(
    await storedFromRow(source),
    input.body,
  );
  return body;
}

export async function explainQuery(
  organization: IOrganizationScope,
  dataSourceId: string,
  input: IExplainQueryInput,
): Promise<IExplainResponse> {
  const source = await oneRow(organization.db, dataSource, dataSourceId, organization);
  if (source === undefined) {
    throw new NotFoundException("That data source does not exist");
  }
  // The gate the client was given, read back from the catalog rather than
  // written out a second time: if the two could disagree, a source could
  // offer a button the server always refuses.
  if (!engineOf(source).supportsExplain) {
    throw new BadRequestException(
      `Explaining queries on ${engineOf(source).name} is not available yet`,
    );
  }

  const sql = readString(
    readBody(input.body, "A statement is required"),
    "sql",
    "A statement is required",
  );

  const body: IExplainResponse = {
    plan: await explainPostgresQuery(await savedConnection(source), sql),
  };
  return body;
}
