import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  applyProposalHandler,
  askDashboardHandler,
  generateDashboardHandler,
} from "./dashboard.ai-controller";

export function dashboardAiRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.post("/api/v1/organization/:organizationId/dashboards/generate", requireSession, requireOrganization, generateDashboardHandler);
  routes.post("/api/v1/organization/:organizationId/dashboards/:id/ask", requireSession, requireOrganization, askDashboardHandler);
  routes.post("/api/v1/organization/:organizationId/dashboards/:id/apply", requireSession, requireOrganization, applyProposalHandler);

  return routes;
}
