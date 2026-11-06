import { and, eq } from "drizzle-orm";
import {
  invitation,
  organization,
  type HeptadecDatabase,
} from "@heptadec/db";
import { authFor } from "../../common/config/better-auth";

import type { IOrganizationScope } from "../../common/session/current-organization";
import {
  NotFoundException,
} from "../../common/exceptions/index";
import { roleOf } from "../rbac/roles";
import type {
  IAcceptInvitationResponse,
  IInvitationListResponse,
  IInvitationPreviewResponse,
} from "./contracts";
import type {
  ICreateInvitationInput,
  IInvitationRow,
} from "./types";

export async function listInvitations(
  organizationScope: IOrganizationScope,
): Promise<IInvitationListResponse> {
  const rows = await organizationScope.db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .where(organizationScope.where(invitation.organizationId));

  const body: IInvitationListResponse = {
    invitations: rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: roleOf(row.role),
      status: row.status,
      expiresAt: row.expiresAt.toISOString(),
    })),
  };
  return body;
}

export async function getInvitationPreview(
  db: HeptadecDatabase,
  invitationId: string,
): Promise<IInvitationPreviewResponse> {
  const row = await invitationRow(db, invitationId);
  requireUsable(row);
  const body: IInvitationPreviewResponse = {
    id: row.id,
    organizationName: row.organizationName,
    organizationSlug: row.organizationSlug,
    email: row.email,
    role: roleOf(row.role),
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
  };
  return body;
}

export async function acceptInvitation(
  db: HeptadecDatabase,
  headers: Headers,
  invitationId: string,
): Promise<{ row: IInvitationRow; response: IAcceptInvitationResponse }> {
  const row = await invitationRow(db, invitationId);
  await authFor(db).api.acceptInvitation({
    body: { invitationId: row.id },
    headers,
  });
  await authFor(db).api.setActiveOrganization({
    body: { organizationId: row.organizationId },
    headers,
  });

  const response: IAcceptInvitationResponse = {
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    role: roleOf(row.role),
  };
  return { row, response };
}

export async function createInvitation(
  organizationScope: IOrganizationScope,
  headers: Headers,
  input: ICreateInvitationInput,
): Promise<{ invited: string; role: string; organizationId: string }> {
  await authFor(organizationScope.db).api.createInvitation({
    body: {
      email: input.email,
      role: input.role,
      organizationId: organizationScope.organizationId,
    },
    headers,
  });

  return {
    invited: input.email,
    role: input.role,
    organizationId: organizationScope.organizationId,
  };
}

export async function declineInvitation(
  db: HeptadecDatabase,
  headers: Headers,
  invitationId: string,
): Promise<{ declined: string }> {
  await authFor(db).api.rejectInvitation({
    body: { invitationId },
    headers,
  });
  return { declined: invitationId };
}

export async function cancelInvitation(
  organizationScope: IOrganizationScope,
  headers: Headers,
  invitationId: string,
): Promise<{ cancelled: string }> {
  const owned = await organizationScope.db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(eq(invitation.id, invitationId), organizationScope.where(invitation.organizationId)),
    )
    .limit(1);

  if (owned.length === 0) {
    throw new NotFoundException("That invitation does not exist");
  }
  await authFor(organizationScope.db).api.cancelInvitation({
    body: { invitationId },
    headers,
  });

  return { cancelled: invitationId };
}

async function invitationRow(db: HeptadecDatabase, invitationId: string): Promise<IInvitationRow> {
  const rows = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      organizationId: invitation.organizationId,
      organizationName: organization.name,
      organizationSlug: organization.slug,
    })
    .from(invitation)
    .innerJoin(organization, eq(invitation.organizationId, organization.id))
    .where(eq(invitation.id, invitationId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw new NotFoundException("That invitation does not exist");
  }
  return row;
}

function requireUsable(row: {
  status: string;
  expiresAt: Date;
}): void {
  if (row.status !== "pending" || row.expiresAt.getTime() < Date.now()) {
    throw new NotFoundException("That invitation is no longer valid");
  }
}
