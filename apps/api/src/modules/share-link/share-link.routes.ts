import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  createShareLinkHandler,
  deleteShareLinkHandler,
  getSharedDashboardHandler,
  listShareLinksHandler,
  refreshShareLinkHandler,
} from "./share-link.controller";

export function shareLinkRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/v1/organization/:organizationId/dashboards/:id/share-links", requireSession, requireOrganization, listShareLinksHandler);
  routes.post("/api/v1/organization/:organizationId/dashboards/:id/share-links", requireSession, requireOrganization, createShareLinkHandler);
  routes.post("/api/v1/organization/:organizationId/share-links/:id/refresh", requireSession, requireOrganization, refreshShareLinkHandler);
  routes.delete("/api/v1/organization/:organizationId/share-links/:id", requireSession, requireOrganization, deleteShareLinkHandler);

  return routes;
}

export function publicShareRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/share/:token", getSharedDashboardHandler);

  return routes;
}
