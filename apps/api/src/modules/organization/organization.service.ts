import { and, eq } from "drizzle-orm";
import {
  member,
  organization,
  type HeptadecDatabase,
} from "@heptadec/db";
import { authFor } from "../../common/config/better-auth";
import type { IOrganizationScope } from "../../common/session/current-organization";
import { deleteOrganizationRows } from "../../common/ownership";
import {
  BadRequestException,
  ForbiddenException,
} from "../../common/exceptions/index";
import { mediaUrl } from "../images/urls";
import { roleOf } from "../rbac/roles";
import type {
  IMembership,
  IOrganizationsResponse,
  ISwitchOrganizationResponse,
} from "./contracts";
import type {
  IDeleteOrganizationInput,
  IListOrganizationsInput,
  ISwitchOrganizationInput,
} from "./types";

export async function listOrganizations(
  db: HeptadecDatabase,
  input: IListOrganizationsInput,
): Promise<IOrganizationsResponse> {
  const rows = await db
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo,
      role: member.role,
    })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(eq(member.userId, input.userId));

  const organizations: IMembership[] = rows.map((row) => ({
    organization: {
      id: row.id,
      name: row.name,
      slug: row.slug,
      logo: row.logo,
      logoUrl: mediaUrl(row.logo, input.publicBase),
    },
    role: roleOf(row.role),
    active: row.id === input.activeOrganizationId,
  }));

  return {
    organizations,
    activeOrganizationId: input.activeOrganizationId,
  };
}

export async function switchOrganization(
  db: HeptadecDatabase,
  input: ISwitchOrganizationInput,
): Promise<ISwitchOrganizationResponse> {
  const membership = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.userId, input.userId),
        eq(member.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (membership.length === 0) {
    throw new ForbiddenException("You are not a member of that organization");
  }

  await authFor(db).api.setActiveOrganization({
    body: { organizationId: input.organizationId },
    headers: input.headers,
  });

  return { activeOrganizationId: input.organizationId };
}

export async function deleteOrganization(
  scope: IOrganizationScope,
  input: IDeleteOrganizationInput,
): Promise<void> {
  const current = await scope.db
    .select({ slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, scope.organizationId))
    .limit(1);
  if (current[0] === undefined || current[0].slug !== input.slug) {
    throw new BadRequestException("That slug is not this organization's");
  }

  await deleteOrganizationRows(scope);

  await authFor(scope.db).api.deleteOrganization({
    body: { organizationId: scope.organizationId },
    headers: input.headers,
  });
}
