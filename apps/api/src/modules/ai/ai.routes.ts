import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  askHandler,
  createProviderHandler,
  deleteProviderHandler,
  draftModelsHandler,
  listProvidersHandler,
  providerModelsHandler,
} from "./ai.controller";

export function aiRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/v1/organization/:organizationId/ai/providers", requireSession, requireOrganization, listProvidersHandler);
  routes.post("/api/v1/organization/:organizationId/ai/providers", requireSession, requireOrganization, createProviderHandler);
  routes.delete("/api/v1/organization/:organizationId/ai/providers/:id", requireSession, requireOrganization, deleteProviderHandler);
  routes.get(
    "/api/v1/organization/:organizationId/ai/providers/:id/models",
    requireSession, requireOrganization,
    providerModelsHandler,
  );
  routes.post("/api/v1/organization/:organizationId/ai/providers/models", requireSession, requireOrganization, draftModelsHandler);
  routes.post("/api/v1/organization/:organizationId/ai/ask", requireSession, requireOrganization, askHandler);

  return routes;
}
