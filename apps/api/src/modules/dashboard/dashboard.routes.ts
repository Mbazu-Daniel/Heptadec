import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  createDashboardHandler,
  createWidgetHandler,
  deleteDashboardHandler,
  deleteWidgetHandler,
  getDashboardHandler,
  getWidgetDataHandler,
  listDashboardsHandler,
  refreshWidgetHandler,
  updateDashboardHandler,
  updateWidgetHandler,
} from "./dashboard.controller";

export function dashboardRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/v1/organization/:organizationId/dashboards", requireSession, requireOrganization, listDashboardsHandler);
  routes.post("/api/v1/organization/:organizationId/dashboards", requireSession, requireOrganization, createDashboardHandler);
  routes.get("/api/v1/organization/:organizationId/dashboards/:id", requireSession, requireOrganization, getDashboardHandler);
  routes.patch("/api/v1/organization/:organizationId/dashboards/:id", requireSession, requireOrganization, updateDashboardHandler);
  routes.delete("/api/v1/organization/:organizationId/dashboards/:id", requireSession, requireOrganization, deleteDashboardHandler);
  routes.post("/api/v1/organization/:organizationId/dashboards/:id/widgets", requireSession, requireOrganization, createWidgetHandler);
  routes.get("/api/v1/organization/:organizationId/widgets/:id/data", requireSession, requireOrganization, getWidgetDataHandler);
  routes.post("/api/v1/organization/:organizationId/widgets/:id/refresh", requireSession, requireOrganization, refreshWidgetHandler);
  routes.patch("/api/v1/organization/:organizationId/widgets/:id", requireSession, requireOrganization, updateWidgetHandler);
  routes.delete("/api/v1/organization/:organizationId/widgets/:id", requireSession, requireOrganization, deleteWidgetHandler);

  return routes;
}
