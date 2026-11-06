import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  createSavedQueryHandler,
  deleteSavedQueryHandler,
  listQueryVersionsHandler,
  listSavedQueriesHandler,
  listSavedQueriesForSourceHandler,
  recordSavedQueryRunHandler,
  restoreSavedQueryHandler,
  updateSavedQueryHandler,
} from "./saved-query.controller";

export function savedQueryRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/v1/organization/:organizationId/saved-queries", requireSession, requireOrganization, listSavedQueriesHandler);
  routes.get("/api/v1/organization/:organizationId/data-sources/:id/saved-queries", requireSession, requireOrganization, listSavedQueriesForSourceHandler);
  routes.post("/api/v1/organization/:organizationId/data-sources/:id/saved-queries", requireSession, requireOrganization, createSavedQueryHandler);
  routes.post("/api/v1/organization/:organizationId/data-sources/:id/saved-queries/runs", requireSession, requireOrganization, recordSavedQueryRunHandler);
  routes.patch("/api/v1/organization/:organizationId/saved-queries/:id", requireSession, requireOrganization, updateSavedQueryHandler);
  routes.delete("/api/v1/organization/:organizationId/saved-queries/:id", requireSession, requireOrganization, deleteSavedQueryHandler);
  routes.get("/api/v1/organization/:organizationId/saved-queries/:id/versions", requireSession, requireOrganization, listQueryVersionsHandler);
  routes.post("/api/v1/organization/:organizationId/saved-queries/:id/restore", requireSession, requireOrganization, restoreSavedQueryHandler);

  return routes;
}
