import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import { readBody, readString } from "../../common/http/body";
import {
  BadRequestException,
} from "../../common/exceptions/index";
import { isRole } from "../rbac/permissions";
import type { Role } from "../rbac/permissions";
import { requireOwner } from "../rbac/owner";
import { recordAudit } from "../audit/index";
import {
  acceptInvitation,
  cancelInvitation,
  createInvitation,
  declineInvitation,
  getInvitationPreview,
  listInvitations,
} from "./invitation.service";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function listInvitationsHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);

  requireOwner(c, "Only an owner can see invitations");

  return c.json(await listInvitations(organization));
}

export async function getInvitationPreviewHandler(
  c: Context<IAuthVars, "/api/invitation/:id">,
) {
  return c.json(await getInvitationPreview(c.get("db"), c.req.param("id")));
}

export async function acceptInvitationHandler(
  c: Context<IAuthVars, "/api/invitation/:id/accept">,
) {
  const { row, response } = await acceptInvitation(
    c.get("db"),
    c.req.raw.headers,
    c.req.param("id"),
  );

  await recordAudit(c, {
    organizationId: row.organizationId,
    event: "invitation.accepted",
    targetKind: "invitation",
    targetId: row.id,
    targetLabel: row.email,
  });

  return c.json(response);
}

export async function createInvitationHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);

  const payload = readBody(await c.req.json(), "An email address is required");
  const email = readString(payload, "email", "The email address is required").trim();
  if (!EMAIL_PATTERN.test(email)) {
    throw new BadRequestException("The email address is not valid");
  }

  const roleValue = payload.role ?? "viewer";
  if (typeof roleValue !== "string" || !isRole(roleValue)) {
    throw new BadRequestException("That role does not exist");
  }
  const role: Role = roleValue;

  requireOwner(c, "Only an owner can invite members");

  const created = await createInvitation(organization, c.req.raw.headers, {
    email,
    role,
  });
  return c.json(created);
}

export async function declineInvitationHandler(
  c: Context<IAuthVars, "/api/invitation/:id/decline">,
) {
  const declined = await declineInvitation(
    c.get("db"),
    c.req.raw.headers,
    c.req.param("id"),
  );
  return c.json(declined);
}

export async function cancelInvitationHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/invitations/:id">,
) {
  const organization = activeOrganization(c);

  requireOwner(c, "Only an owner can cancel an invitation");
  const invitationId = c.req.param("id");
  const cancelled = await cancelInvitation(
    organization,
    c.req.raw.headers,
    invitationId,
  );

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "invitation.cancelled",
    targetKind: "invitation",
    targetId: invitationId,
  });

  return c.json(cancelled);
}
