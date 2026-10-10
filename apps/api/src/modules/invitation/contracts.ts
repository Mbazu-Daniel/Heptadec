import type { organization } from "better-auth/plugins";
import type { Role } from "../rbac/permissions";

type OrganizationOptions = NonNullable<Parameters<typeof organization>[0]>;

type SendInvitationEmail = NonNullable<
  OrganizationOptions["sendInvitationEmail"]
>;

export type IInvitationMail = Parameters<SendInvitationEmail>[0];

export interface IInvitationPreviewResponse {
  id: string;
  organizationName: string;
  organizationSlug: string;
  email: string;
  role: Role;
  status: string;
  expiresAt: string;
}

export interface IAcceptInvitationResponse {
  organizationId: string;
  organizationName: string;
  role: Role;
}

export interface IInvitationListResponse {
  invitations: Array<{
    id: string;
    email: string;
    role: Role;
    status: string;
    expiresAt: string;
  }>;
}