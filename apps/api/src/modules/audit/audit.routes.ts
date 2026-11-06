import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { listAuditLogsHandler } from "./audit.controller";

export function auditRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/v1/organization/:organizationId/audit-logs", requireSession, requireOrganization, listAuditLogsHandler);

  return routes;
}
