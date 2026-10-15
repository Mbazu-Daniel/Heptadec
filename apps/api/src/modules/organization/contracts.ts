import type { Role } from "../rbac/permissions";

export interface IOrganization {
  id: string;
  name: string;
  slug: string;
  /** The bucket key, as stored. */
  logo: string | null;
  /** Where to load it, resolved from the key and the bucket's public base. */
  logoUrl: string | null;
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