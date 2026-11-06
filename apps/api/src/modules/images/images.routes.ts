import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  imagesConfigHandler,
  presignImageHandler,
  serveImageHandler,
} from "./images.controller";

export function imageRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/images/config", imagesConfigHandler);
  routes.post("/api/v1/organization/:organizationId/images/presign", requireSession, requireOrganization, presignImageHandler);
  routes.get("/api/images/*", serveImageHandler);

  return routes;
}
