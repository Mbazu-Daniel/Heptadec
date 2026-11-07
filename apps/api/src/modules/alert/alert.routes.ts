import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  createAlertRuleHandler,
  deleteAlertRuleHandler,
  listAlertDeliveriesHandler,
  listAlertRulesHandler,
  runAlertChecksHandler,
  updateAlertRuleHandler,
} from "./alert.controller";

export function alertRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/v1/organization/:organizationId/alert-rules", requireSession, requireOrganization, listAlertRulesHandler);
  routes.post("/api/v1/organization/:organizationId/alert-rules", requireSession, requireOrganization, createAlertRuleHandler);
  routes.put("/api/v1/organization/:organizationId/alert-rules/:id", requireSession, requireOrganization, updateAlertRuleHandler);
  routes.delete("/api/v1/organization/:organizationId/alert-rules/:id", requireSession, requireOrganization, deleteAlertRuleHandler);
  routes.get("/api/v1/organization/:organizationId/alert-deliveries", requireSession, requireOrganization, listAlertDeliveriesHandler);
  routes.post("/api/v1/organization/:organizationId/saved-queries/:id/alert-checks", requireSession, requireOrganization, runAlertChecksHandler);

  return routes;
}
