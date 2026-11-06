import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  createNotificationChannelHandler,
  deleteNotificationChannelHandler,
  listNotificationChannelsHandler,
  updateNotificationChannelHandler,
} from "./notification.controller";

export function notificationRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/v1/organization/:organizationId/notification-channels", requireSession, requireOrganization, listNotificationChannelsHandler);
  routes.post("/api/v1/organization/:organizationId/notification-channels", requireSession, requireOrganization, createNotificationChannelHandler);
  routes.patch("/api/v1/organization/:organizationId/notification-channels/:id", requireSession, requireOrganization, updateNotificationChannelHandler);
  routes.delete("/api/v1/organization/:organizationId/notification-channels/:id", requireSession, requireOrganization, deleteNotificationChannelHandler);

  return routes;
}
