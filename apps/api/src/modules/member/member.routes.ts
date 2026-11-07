import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  getMemberProfileHandler,
  listMembersHandler,
  removeMemberHandler,
  updateMemberHandler,
  updateMemberRoleHandler,
} from "./member.controller";

export function memberRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/v1/organization/:organizationId/member", requireSession, requireOrganization, getMemberProfileHandler);
  routes.patch("/api/v1/organization/:organizationId/member", requireSession, requireOrganization, updateMemberHandler);
  routes.get("/api/v1/organization/:organizationId/members", requireSession, requireOrganization, listMembersHandler);
  routes.patch("/api/v1/organization/:organizationId/members/:id", requireSession, requireOrganization, updateMemberRoleHandler);
  routes.delete("/api/v1/organization/:organizationId/members/:id", requireSession, requireOrganization, removeMemberHandler);

  return routes;
}
