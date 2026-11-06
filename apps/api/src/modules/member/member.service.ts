import { eq, sql } from "drizzle-orm";
import { member, user } from "@heptadec/db";
import { authFor } from "../../common/config/better-auth";
import type {
  IOrganizationScope,
  IRequestScope,
} from "../../common/session/current-organization";
import { roleOf } from "../rbac/roles";
import { mediaUrl } from "../images/urls";
import type { IMemberProfileResponse, IMembersResponse } from "./contracts";
import type {
  IListMembersInput,
  IMemberProfileInput,
  IRemoveMemberInput,
  IUpdateDisplayNameInput,
  IUpdateMemberImageInput,
  IUpdateMemberRoleInput,
} from "./types";

export async function getMemberProfile(
  organization: IRequestScope,
  input: IMemberProfileInput,
): Promise<IMemberProfileResponse> {
  return {
    displayName: organization.caller.displayName,
    image: mediaUrl(organization.caller.image, input.base),
    role: roleOf(organization.caller.role),
    organizationId: organization.organizationId,
  };
}

export async function updateDisplayName(
  organization: IRequestScope,
  input: IUpdateDisplayNameInput,
): Promise<IMemberProfileResponse> {
  await organization.db
    .update(member)
    .set({ displayName: input.displayName })
    .where(eq(member.id, organization.caller.id));

  return {
    displayName: input.displayName,
    image: mediaUrl(organization.caller.image, input.base),
    role: roleOf(organization.caller.role),
    organizationId: organization.organizationId,
  };
}

export async function updateMemberImage(
  organization: IRequestScope,
  input: IUpdateMemberImageInput,
): Promise<IMemberProfileResponse> {
  await organization.db
    .update(member)
    .set({ image: input.image })
    .where(eq(member.id, organization.caller.id));

  return {
    displayName: organization.caller.displayName,
    image: mediaUrl(input.image, input.base),
    role: roleOf(organization.caller.role),
    organizationId: organization.organizationId,
  };
}

export async function listMembers(
  organization: IOrganizationScope,
  input: IListMembersInput,
): Promise<IMembersResponse> {
  const rows = await organization.db
    .select({
      id: member.id,
      userId: member.userId,
      name: user.name,
      email: user.email,
      displayName: member.displayName,
      image: member.image,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(organization.where(member.organizationId))
    .orderBy(sql`lower(${user.email})`);

  return {
    members: rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      name: row.name,
      email: row.email,
      displayName: row.displayName,
      image: mediaUrl(row.image, input.base),
      role: roleOf(row.role),
      isYou: row.userId === input.currentUserId,
    })),
  };
}

export async function updateMemberRole(
  organization: IOrganizationScope,
  input: IUpdateMemberRoleInput,
): Promise<{ id: string; role: string }> {
  await authFor(organization.db).api.updateMemberRole({
    body: {
      memberId: input.memberId,
      role: input.role,
      organizationId: organization.organizationId,
    },
    headers: input.headers,
  });
  return { id: input.memberId, role: input.role };
}

export async function removeMember(
  organization: IOrganizationScope,
  input: IRemoveMemberInput,
): Promise<{ removed: string }> {
  await authFor(organization.db).api.removeMember({
    body: {
      memberIdOrEmail: input.memberId,
      organizationId: organization.organizationId,
    },
    headers: input.headers,
  });
  return { removed: input.memberId };
}
