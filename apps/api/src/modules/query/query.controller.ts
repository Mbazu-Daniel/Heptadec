import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import {
  ForbiddenException,
} from "../../common/exceptions/index";
import { can } from "../rbac/authorize";
import { explainQuery, runQuery } from "./query.service";

export async function runQueryHandler(c: Context<IAuthVars, "/api/v1/organization/:organizationId/data-sources/:id/query">) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "query", "create"))) {
    throw new ForbiddenException("Only owners and editors can run queries");
  }

  const body = await runQuery(
    organization,
    c.req.param("id"),
    { body: await c.req.json() },
  );
  return c.json(body);
}

export async function explainQueryHandler(c: Context<IAuthVars, "/api/v1/organization/:organizationId/data-sources/:id/explain">) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "query", "create"))) {
    throw new ForbiddenException("Only owners and editors can explain queries");
  }

  const body = await explainQuery(
    organization,
    c.req.param("id"),
    { body: await c.req.json() },
  );
  return c.json(body);
}
