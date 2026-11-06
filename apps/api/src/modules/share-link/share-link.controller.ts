import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { readBody } from "../../common/http/body";
import { BadRequestException, ForbiddenException } from "../../common/exceptions/index";
import { activeOrganization } from "../../common/session/current-organization";
import { can } from "../rbac/authorize";
import { recordAudit } from "../audit/index";
import {
  createShareLink,
  deleteShareLink,
  getSharedDashboard,
  listShareLinks,
  refreshShareLink,
} from "./share-link.service";

const MAX_EXPIRY_DAYS = 365;

function readExpiry(body: Record<string, unknown>): number | null {
  const value = body.expiresInDays;
  if (value === undefined || value === null) {
    return null;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_EXPIRY_DAYS
  ) {
    throw new BadRequestException(
      `Expiry must be between 1 and ${MAX_EXPIRY_DAYS} days`,
    );
  }
  return value;
}

export async function listShareLinksHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/dashboards/:id/share-links">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "shareLink", "create"))) {
    throw new ForbiddenException("Only owners and editors can see share links");
  }

  return c.json(await listShareLinks(organization, c.req.param("id")));
}

export async function createShareLinkHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/dashboards/:id/share-links">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "shareLink", "create"))) {
    throw new ForbiddenException("Only owners and editors can share dashboards");
  }

  const raw = await c.req.json().catch(() => ({}));
  const fields = readBody(raw, "Send the link settings as JSON");
  const expiresInDays = readExpiry(fields);

  const created = await createShareLink(organization, {
    dashboardId: c.req.param("id"),
    expiresInDays,
  });

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "share_link.created",
    targetKind: "share_link",
    targetId: created.shareLink.id,
    targetLabel: created.dashboardName,
  });
  return c.json({ shareLink: created.shareLink, url: created.url }, 201);
}

export async function refreshShareLinkHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/share-links/:id/refresh">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "shareLink", "create"))) {
    throw new ForbiddenException("Only owners and editors can refresh share links");
  }

  const refreshed = await refreshShareLink(organization, c.req.param("id"));

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "share_link.refreshed",
    targetKind: "share_link",
    targetId: refreshed.shareLink.id,
    targetLabel: refreshed.dashboardName,
  });
  return c.json(refreshed.shareLink);
}

export async function deleteShareLinkHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/share-links/:id">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "shareLink", "delete"))) {
    throw new ForbiddenException("Only owners and editors can revoke share links");
  }

  const removed = await deleteShareLink(organization, c.req.param("id"));

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "share_link.deleted",
    targetKind: "share_link",
    targetId: removed.id,
  });
  return c.json({ id: removed.id });
}

export async function getSharedDashboardHandler(
  c: Context<IAuthVars, "/api/share/:token">,
) {
  return c.json(
    await getSharedDashboard(
      c.get("db"),
      c.req.param("token"),
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "direct",
    ),
  );
}
