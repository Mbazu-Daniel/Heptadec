import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { schema } from "@heptadec/db";
import { authFor } from "../../common/config/better-auth";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { readBody, readString } from "../../common/http/body";
import { activeOrganization } from "../../common/session/current-organization";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions";
import { isRole, type Role } from "../rbac/permissions";
import { roleOf } from "../rbac/roles";
import { can } from "../rbac/authorize";
import { recordAudit, auditActor } from "../audit";
import type {
  IAcceptInvitationResponse,
  IInvitationListResponse,
  IInvitationPreviewResponse,
} from "./contracts";

const { invitation, organization } = schema;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function invitationRow(db: IAuthVars["Bindings"]["db"], invitationId: string) {
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

export function invitationRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/organization/invitations", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "invitation", "create"))) {
      throw new ForbiddenException("Only an owner can see invitations");
    }

    const rows = await organization.db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      })
      .from(invitation)
      .where(organization.where(invitation.organizationId));

    const body: IInvitationListResponse = {
      invitations: rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: roleOf(row.role),
        status: row.status,
        expiresAt: row.expiresAt.toISOString(),
      })),
    };
    return c.json(body);
  });

  routes.get("/api/invitation/:id", async (c) => {
    const row = await invitationRow(c.get("db"), c.req.param("id"));
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
    return c.json(body);
  });

  routes.post("/api/invitation/:id/accept", requireSession, async (c) => {
    const row = await invitationRow(c.get("db"), c.req.param("id"));
    await authFor(c.get("db")).api.acceptInvitation({
      body: { invitationId: row.id },
      headers: c.req.raw.headers,
    });
    await authFor(c.get("db")).api.setActiveOrganization({
      body: { organizationId: row.organizationId },
      headers: c.req.raw.headers,
    });

    const actor = auditActor(c);
    await recordAudit(c.get("db"), {
      organizationId: row.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "invitation.accepted",
      targetKind: "invitation",
      targetId: row.id,
      targetLabel: row.email,
    });

    const body: IAcceptInvitationResponse = {
      organizationId: row.organizationId,
      organizationName: row.organizationName,
      role: roleOf(row.role),
    };
    return c.json(body);
  });

  routes.post("/api/organization/invitations", requireSession, async (c) => {
    const organization = activeOrganization(c);

    const payload = readBody(await c.req.json(), "An email address is required");
    const email = readString(payload, "email", "The email address is required").trim();
    if (!EMAIL_PATTERN.test(email)) {
      throw new BadRequestException("The email address is not valid");
    }

    const roleValue = payload.role ?? "viewer";
    if (typeof roleValue !== "string" || !isRole(roleValue)) {
      throw new BadRequestException("That role does not exist");
    }
    const role: Role = roleValue;

    if (!(await can(organization.db, c.req.raw.headers, "invitation", "create"))) {
      throw new ForbiddenException("Only an owner can invite members");
    }

    await authFor(c.get("db")).api.createInvitation({
      body: { email, role, organizationId: organization.organizationId },
      headers: c.req.raw.headers,
    });

    return c.json({
      invited: email,
      role,
      organizationId: organization.organizationId,
    });
  });

  routes.post("/api/invitation/:id/decline", requireSession, async (c) => {
    await authFor(c.get("db")).api.rejectInvitation({
      body: { invitationId: c.req.param("id") },
      headers: c.req.raw.headers,
    });
    return c.json({ declined: c.req.param("id") });
  });

  routes.delete("/api/organization/invitations/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "invitation", "cancel"))) {
      throw new ForbiddenException("Only an owner can cancel an invitation");
    }
    const invitationId = c.req.param("id");
    const owned = await organization.db
      .select({ id: invitation.id })
      .from(invitation)
      .where(
        and(eq(invitation.id, invitationId), organization.where(invitation.organizationId)),
      )
      .limit(1);

    if (owned.length === 0) {
      throw new NotFoundException("That invitation does not exist");
    }
    await authFor(c.get("db")).api.cancelInvitation({
      body: { invitationId },
      headers: c.req.raw.headers,
    });

    const actor = auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "invitation.cancelled",
      targetKind: "invitation",
      targetId: invitationId,
    });

    return c.json({ cancelled: invitationId });
  });

  return routes;
}
