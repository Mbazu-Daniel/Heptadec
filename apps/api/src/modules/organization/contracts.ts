import type { Role } from "../rbac/permissions";

export interface IOrganization {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
}

export interface IMembership {
  organization: IOrganization;
  role: Role;
  active: boolean;
}

export interface IOrganizationsResponse {
  organizations: IMembership[];
  activeOrganizationId: string | null;
}

export interface ISwitchOrganizationResponse {
  activeOrganizationId: string;
}