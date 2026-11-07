import { and, eq } from "drizzle-orm";
import { dataSource } from "@heptadec/db";

import type { IOrganizationScope } from "../../common/session/current-organization";
import {
  NotFoundException,
} from "../../common/exceptions/index";
import { storedFromRow } from "../data-source/connection";
import { introspectSchema } from "./introspect";
import type { ISchemaResponse } from "./contracts";
import type { IGetSchemaInput } from "./types";

export async function getSourceSchema(
  organization: IOrganizationScope,
  input: IGetSchemaInput,
): Promise<ISchemaResponse> {
  const rows = await organization.db
    .select()
    .from(dataSource)
    .where(
      and(
        eq(dataSource.id, input.dataSourceId),
        organization.where(dataSource.organizationId),
      ),
    )
    .limit(1);

  const source = rows[0];
  if (source === undefined) {
    throw new NotFoundException("That data source does not exist");
  }

  const introspected = await introspectSchema(await storedFromRow(source));
  const body: ISchemaResponse = { sourceId: source.id, ...introspected };
  return body;
}
