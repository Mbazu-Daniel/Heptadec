import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  createScheduledJobHandler,
  deleteScheduledJobHandler,
  listScheduledJobsHandler,
  updateScheduledJobHandler,
} from "./scheduler.controller";

export function schedulerRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/v1/organization/:organizationId/scheduled-jobs", requireSession, requireOrganization, listScheduledJobsHandler);
  routes.post("/api/v1/organization/:organizationId/scheduled-jobs", requireSession, requireOrganization, createScheduledJobHandler);
  routes.put("/api/v1/organization/:organizationId/scheduled-jobs/:id", requireSession, requireOrganization, updateScheduledJobHandler);
  routes.delete("/api/v1/organization/:organizationId/scheduled-jobs/:id", requireSession, requireOrganization, deleteScheduledJobHandler);

  return routes;
}
