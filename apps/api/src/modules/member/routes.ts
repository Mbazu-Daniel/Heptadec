import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { schema } from "@heptadec/db";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { readBody, readString } from "../../common/http/body";
import { activeOrganization } from "../../common/session/current-organization";
import {
  BadRequestException,
  ForbiddenException,
} from "../../common/exceptions";
import { authFor } from "../../common/config/better-auth";
import { isRole } from "../rbac/permissions";
import { roleOf } from "../rbac/roles";
import { avatarKeyPrefixFor } from "../images/contracts";
import { mediaUrl, publicBaseFrom } from "../images/urls";
import { can } from "../rbac/authorize";
import { recordAudit, auditActor } from "../audit";
import type { IMemberProfileResponse, IMembersResponse } from "./contracts";

const { member, user } = schema;

const MAX_DISPLAY_NAME = 120;

export function memberRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/organization/member", requireSession, async (c) => {
    const session = c.get("session")!;
    const organization = activeOrganization(c);
    const base = publicBaseFrom(c.env);

    const rows = await organization.db
      .select({
        displayName: member.displayName,
        image: member.image,
        role: member.role,
      })
      .from(member)
      .where(
        and(
          eq(member.userId, session.user.id),
          organization.where(member.organizationId),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      throw new ForbiddenException("You are not a member of that organization");
    }

    const body: IMemberProfileResponse = {
      displayName: rows[0]!.displayName ?? null,
      image: mediaUrl(rows[0]!.image, base),
      role: roleOf(rows[0]!.role),
      organizationId: organization.organizationId,
    };
    return c.json(body);
  });

  routes.patch("/api/organization/member", requireSession, async (c) => {
    const session = c.get("session")!;
    const organization = activeOrganization(c);
    const base = publicBaseFrom(c.env);

    const payload = readBody(await c.req.json(), "A display name is required");
    const raw = payload.displayName;
    if (raw !== null && typeof raw !== "string") {
      throw new BadRequestException("The display name must be text");
    }
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed.length > MAX_DISPLAY_NAME) {
      throw new BadRequestException("The display name is too long");
    }
    const displayName = trimmed.length === 0 ? null : trimmed;

    const updated = await organization.db
      .update(member)
      .set({ displayName })
      .where(
        and(
          eq(member.userId, session.user.id),
          organization.where(member.organizationId),
        ),
      )
      .returning({
        displayName: member.displayName,
        image: member.image,
        role: member.role,
      });

    if (updated.length === 0) {
      throw new ForbiddenException("You are not a member of that organization");
    }

    const body: IMemberProfileResponse = {
      displayName: updated[0]!.displayName ?? null,
      image: mediaUrl(updated[0]!.image, base),
      role: roleOf(updated[0]!.role),
      organizationId: organization.organizationId,
    };
    return c.json(body);
  });

  routes.patch("/api/organization/member/image", requireSession, async (c) => {
    const session = c.get("session")!;
    const organization = activeOrganization(c);
    const base = publicBaseFrom(c.env);

    const payload = readBody(await c.req.json(), "That image could not be saved");
    const raw = payload.image;
    if (raw !== null && typeof raw !== "string") {
      throw new BadRequestException("The image must be text or nothing");
    }
    const image = raw === null || raw === "" ? null : raw;
    if (
      image !== null &&
      !image.startsWith(avatarKeyPrefixFor(organization.organizationId))
    ) {
      // Not an empty-fallback guard but a real one: the only writer of this
      // column is the upload flow, and an arbitrary URL here would be an image
      // this server never checked the type of.
      throw new BadRequestException("That image did not come from this organization");
    }

    const updated = await organization.db
      .update(member)
      .set({ image })
      .where(
        and(
          eq(member.userId, session.user.id),
          organization.where(member.organizationId),
        ),
      )
      .returning({
        displayName: member.displayName,
        image: member.image,
        role: member.role,
      });

    if (updated.length === 0) {
      throw new ForbiddenException("You are not a member of that organization");
    }

    const body: IMemberProfileResponse = {
      displayName: updated[0]!.displayName ?? null,
      image: mediaUrl(updated[0]!.image, base),
      role: roleOf(updated[0]!.role),
      organizationId: organization.organizationId,
    };
    return c.json(body);
  });

  routes.get("/api/organization/members", requireSession, async (c) => {
    const session = c.get("session")!;
    const organization = activeOrganization(c);
    const base = publicBaseFrom(c.env);

    const rows = await organization.db
      .select({
        id: member.id,
        userId: member.userId,
        name: user.name,
        email: user.email,
        displayName: member.displayName,
        image: member.image,
        role: member.role,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(organization.where(member.organizationId))
      .orderBy(sql`lower(${user.email})`);

    const body: IMembersResponse = {
      members: rows.map((row) => ({
        id: row.id,
        userId: row.userId,
        name: row.name,
        email: row.email,
        displayName: row.displayName,
        image: mediaUrl(row.image, base),
        role: roleOf(row.role),
        isYou: row.userId === session.user.id,
      })),
    };
    return c.json(body);
  });

  routes.patch("/api/organization/members/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "member", "update"))) {
      throw new ForbiddenException("Only an owner can change a role");
    }

    const payload = readBody(await c.req.json(), "A role is required");
    const role = readString(payload, "role", "A role is required");
    if (!isRole(role)) {
      throw new BadRequestException("That role does not exist");
    }

    await authFor(organization.db).api.updateMemberRole({
      body: {
        memberId: c.req.param("id"),
        role,
        organizationId: organization.organizationId,
      },
      headers: c.req.raw.headers,
    });

    const actor = auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "member.role_updated",
      targetKind: "member",
      targetId: c.req.param("id"),
      detail: role,
    });

    return c.json({ id: c.req.param("id"), role });
  });

  routes.delete("/api/organization/members/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "member", "delete"))) {
      throw new ForbiddenException("Only an owner can remove a member");
    }

    await authFor(organization.db).api.removeMember({
      body: {
        memberIdOrEmail: c.req.param("id"),
        organizationId: organization.organizationId,
      },
      headers: c.req.raw.headers,
    });

    const actor = auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "member.removed",
      targetKind: "member",
      targetId: c.req.param("id"),
    });

    return c.json({ removed: c.req.param("id") });
  });

  return routes;
}
