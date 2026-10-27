import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import {
  member,
  organization,
  type HeptadecDatabase,
} from "@heptadec/db";
import { authFor } from "../../common/config/better-auth";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { readBody, readString } from "../../common/http/body";
import { currentOrganizationId } from "../../common/session/current-organization";
import { deleteOrganizationRows } from "../../common/ownership";
import {
  BadRequestException,
  ForbiddenException,
} from "../../common/exceptions";
import { requireOwner } from "../rbac/owner";
import { roleOf } from "../rbac/roles";
import { activeOrganization } from "../../common/session/current-organization";
import { mediaUrl, publicBaseFrom } from "../images/urls";
import type {
  IMembership,
  IOrganizationsResponse,
  ISwitchOrganizationResponse,
} from "./contracts";

const MAX_SLUG = 80;

export function organizationRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/organization", requireSession, async (c) => {
    const session = c.get("session")!;
    const rows = await c.get("db")
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        logo: organization.logo,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, session.user.id));

    const activeId = currentOrganizationId(session);
    const base = publicBaseFrom(c.env);
    const organizations: IMembership[] = rows.map((row) => ({
      organization: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        logo: row.logo,
        logoUrl: mediaUrl(row.logo, base),
      },
      role: roleOf(row.role),
      active: row.id === activeId,
    }));

    const body: IOrganizationsResponse = {
      organizations,
      activeOrganizationId: activeId,
    };
    return c.json(body);
  });

  routes.post("/api/organization/switch", requireSession, async (c) => {
    const session = c.get("session")!;
    const body = readBody(await c.req.json(), "An organization id is required");
    const organizationId = readString(
      body,
      "organizationId",
      "An organization id is required",
    );

    const membership = await c.get("db")
      .select({ id: member.id })
      .from(member)
      .where(
        and(
          eq(member.userId, session.user.id),
          eq(member.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (membership.length === 0) {
      throw new ForbiddenException("You are not a member of that organization");
    }

    await authFor(c.get("db")).api.setActiveOrganization({
      body: { organizationId },
      headers: c.req.raw.headers,
    });

    const response: ISwitchOrganizationResponse = { activeOrganizationId: organizationId };
    return c.json(response);
  });

  routes.post("/api/organization/delete", requireSession, async (c) => {
    const scope = activeOrganization(c);

    requireOwner(c, "Only an owner can delete an organization");

    const body = readBody(await c.req.json(), "Type the organization slug to confirm");
    const slug = readString(body, "slug", "Type the organization slug to confirm", MAX_SLUG);
    const current = await c.get("db")
      .select({ slug: organization.slug })
      .from(organization)
      .where(eq(organization.id, scope.organizationId))
      .limit(1);
    if (current[0] === undefined || current[0].slug !== slug) {
      throw new BadRequestException("That slug is not this organization's");
    }

    await deleteOrganizationRows(scope);

    await authFor(c.get("db")).api.deleteOrganization({
      body: { organizationId: scope.organizationId },
      headers: c.req.raw.headers,
    });

    return c.json({ deleted: true });
  });

  return routes;
}
