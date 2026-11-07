import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import { readBody, readString } from "../../common/http/body";
import { BadRequestException } from "../../common/exceptions/index";
import { isRole } from "../rbac/permissions";
import { avatarKeyPrefixFor } from "../images/contracts";
import { publicBaseFrom } from "../images/urls";
import { requireOwner } from "../rbac/owner";
import { recordAudit } from "../audit/index";
import {
  getMemberProfile,
  listMembers,
  removeMember,
  updateDisplayName,
  updateMemberImage,
  updateMemberRole,
} from "./member.service";

const MAX_DISPLAY_NAME = 120;

export async function getMemberProfileHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  const base = publicBaseFrom(c.env);
  return c.json(await getMemberProfile(organization, { base }));
}

export async function updateDisplayNameHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  const base = publicBaseFrom(c.env);

  const payload = readBody(await c.req.json(), "A display name is required");
  const raw = payload.displayName;
  if (raw !== null && typeof raw !== "string") {
    throw new BadRequestException("The display name must be text");
  }
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed.length > MAX_DISPLAY_NAME) {
    throw new BadRequestException("The display name is too long");
  }
  const displayName = trimmed.length === 0 ? null : trimmed;

  return c.json(await updateDisplayName(organization, { displayName, base }));
}

export async function updateMemberImageHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  const base = publicBaseFrom(c.env);

  const payload = readBody(await c.req.json(), "That image could not be saved");
  const raw = payload.image;
  if (raw !== null && typeof raw !== "string") {
    throw new BadRequestException("The image must be text or nothing");
  }
  const image = raw === null || raw === "" ? null : raw;
  if (
    image !== null &&
    !image.startsWith(avatarKeyPrefixFor(organization.organizationId))
  ) {
    throw new BadRequestException("That image did not come from this organization");
  }

  return c.json(await updateMemberImage(organization, { image, base }));
}

export async function listMembersHandler(c: Context<IAuthVars>) {
  const session = c.get("session")!;
  const organization = activeOrganization(c);
  const base = publicBaseFrom(c.env);

  return c.json(
    await listMembers(organization, {
      currentUserId: session.user.id,
      base,
    }),
  );
}

export async function updateMemberRoleHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/members/:id">,
) {
  const organization = activeOrganization(c);

  requireOwner(c, "Only an owner can change a role");

  const payload = readBody(await c.req.json(), "A role is required");
  const role = readString(payload, "role", "A role is required");
  if (!isRole(role)) {
    throw new BadRequestException("That role does not exist");
  }

  const result = await updateMemberRole(organization, {
    memberId: c.req.param("id"),
    role,
    headers: c.req.raw.headers,
  });

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "member.role_updated",
    targetKind: "member",
    targetId: c.req.param("id"),
    detail: role,
  });

  return c.json(result);
}

export async function removeMemberHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/members/:id">,
) {
  const organization = activeOrganization(c);

  requireOwner(c, "Only an owner can remove a member");

  const result = await removeMember(organization, {
    memberId: c.req.param("id"),
    headers: c.req.raw.headers,
  });

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "member.removed",
    targetKind: "member",
    targetId: c.req.param("id"),
  });

  return c.json(result);
}
