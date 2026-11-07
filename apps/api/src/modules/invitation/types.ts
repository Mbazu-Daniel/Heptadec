import type { Role } from "../rbac/permissions";

export interface ICreateInvitationInput {
  email: string;
  role: Role;
}

export interface IInvitationRow {
  id: string;
  email: string;
  role: string;
  status: string;
  expiresAt: Date;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
}
