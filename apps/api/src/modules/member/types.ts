import type { Role } from "../rbac/permissions";

export interface IMemberProfileInput {
  base: string | null;
}

export interface IUpdateMemberProfileInput {
  displayName?: string | null;
  image?: string | null;
  base: string | null;
}

export interface IListMembersInput {
  currentUserId: string;
  base: string | null;
}

export interface IUpdateMemberRoleInput {
  memberId: string;
  role: Role;
  headers: Headers;
}

export interface IRemoveMemberInput {
  memberId: string;
  headers: Headers;
}
