import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  acceptInvitationHandler,
  cancelInvitationHandler,
  createInvitationHandler,
  declineInvitationHandler,
  getInvitationPreviewHandler,
  listInvitationsHandler,
} from "./invitation.controller";

export function invitationRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/v1/organization/:organizationId/invitations", requireSession, requireOrganization, listInvitationsHandler);
  routes.get("/api/invitation/:id", getInvitationPreviewHandler);
  routes.post("/api/invitation/:id/accept", requireSession, acceptInvitationHandler);
  routes.post("/api/v1/organization/:organizationId/invitations", requireSession, requireOrganization, createInvitationHandler);
  routes.post("/api/invitation/:id/decline", requireSession, declineInvitationHandler);
  routes.delete("/api/v1/organization/:organizationId/invitations/:id", requireSession, requireOrganization, cancelInvitationHandler);

  return routes;
}
