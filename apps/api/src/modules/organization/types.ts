export interface IListOrganizationsInput {
  userId: string;
  activeOrganizationId: string | null;
  publicBase: string | null;
}

export interface ISwitchOrganizationInput {
  organizationId: string;
  userId: string;
  headers: Headers;
}

export interface IDeleteOrganizationInput {
  slug: string;
  headers: Headers;
}
