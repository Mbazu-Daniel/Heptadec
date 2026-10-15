import type { Role } from "../rbac/permissions";

export interface IMemberProfileResponse {
  displayName: string | null;
  role: Role;
  organizationId: string;
}

export interface IMembersResponse {
  members: Array<{
    id: string;
    userId: string;
    name: string;
    email: string;
    displayName: string | null;
    role: Role;
    isYou: boolean;
  }>;
}
