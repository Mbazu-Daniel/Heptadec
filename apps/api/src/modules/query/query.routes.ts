import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  explainQueryHandler,
  runQueryHandler,
} from "./query.controller";

export function queryRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.post("/api/v1/organization/:organizationId/data-sources/:id/query", requireSession, requireOrganization, runQueryHandler);
  routes.post("/api/v1/organization/:organizationId/data-sources/:id/explain", requireSession, requireOrganization, explainQueryHandler);

  return routes;
}
