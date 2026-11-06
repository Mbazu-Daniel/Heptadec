import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import {
  ForbiddenException,
} from "../../common/exceptions/index";
import { can } from "../rbac/authorize";
import { getSourceSchema } from "./schema.service";

export async function getSourceSchemaHandler(c: Context<IAuthVars, "/api/v1/organization/:organizationId/data-sources/:id/schema">) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dataSource", "query"))) {
    throw new ForbiddenException(
      "Only owners and editors can read a source's structure",
    );
  }

  const body = await getSourceSchema(organization, { dataSourceId: c.req.param("id") });
  return c.json(body);
}
