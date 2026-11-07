import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { getSourceSchemaHandler } from "./schema.controller";

export function schemaRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/v1/organization/:organizationId/data-sources/:id/schema", requireSession, requireOrganization, getSourceSchemaHandler);

  return routes;
}
