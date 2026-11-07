import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  createMcpTokenHandler,
  listMcpTokensHandler,
  mcpHandler,
  revokeMcpTokenHandler,
} from "./mcp.controller";

export function mcpRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.post("/api/v1/organization/:organizationId/mcp-tokens", requireSession, requireOrganization, createMcpTokenHandler);
  routes.get("/api/v1/organization/:organizationId/mcp-tokens", requireSession, requireOrganization, listMcpTokensHandler);
  routes.delete("/api/v1/organization/:organizationId/mcp-tokens/:id", requireSession, requireOrganization, revokeMcpTokenHandler);
  routes.all("/mcp", mcpHandler);

  return routes;
}
