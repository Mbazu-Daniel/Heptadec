import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  createDataSourceHandler,
  deleteDataSourceHandler,
  listDataSourceObjectsHandler,
  listDataSourcesHandler,
  previewDataSourceObjectHandler,
  testDataSourceConnectionHandler,
  updateDataSourceHandler,
} from "./data-source.controller";

export function dataSourceRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/v1/organization/:organizationId/data-sources", requireSession, requireOrganization, listDataSourcesHandler);
  routes.post("/api/v1/organization/:organizationId/data-sources", requireSession, requireOrganization, createDataSourceHandler);
  routes.patch("/api/v1/organization/:organizationId/data-sources/:id", requireSession, requireOrganization, updateDataSourceHandler);
  routes.delete("/api/v1/organization/:organizationId/data-sources/:id", requireSession, requireOrganization, deleteDataSourceHandler);
  routes.get("/api/v1/organization/:organizationId/data-sources/:id/objects", requireSession, requireOrganization, listDataSourceObjectsHandler);
  routes.post("/api/v1/organization/:organizationId/data-sources/:id/preview", requireSession, requireOrganization, previewDataSourceObjectHandler);
  routes.post("/api/v1/organization/:organizationId/data-sources/test", requireSession, requireOrganization, testDataSourceConnectionHandler);

  return routes;
}
