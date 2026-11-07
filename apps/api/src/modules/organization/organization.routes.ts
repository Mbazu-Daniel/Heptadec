import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  deleteOrganizationHandler,
  listOrganizationsHandler,
  switchOrganizationHandler,
} from "./organization.controller";

export function organizationRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/v1/organization", requireSession, listOrganizationsHandler);
  routes.post("/api/v1/organization/switch", requireSession, switchOrganizationHandler);
  routes.post("/api/v1/organization/:organizationId/delete", requireSession, requireOrganization, deleteOrganizationHandler);

  return routes;
}
