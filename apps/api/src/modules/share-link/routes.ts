import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@heptadec/db";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { readBody } from "../../common/http/body";
import { config } from "../../common/config/env";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  TooManyRequestsException,
} from "../../common/exceptions";
import {
  activeOrganization,
  oneRow,
  type IOrganizationScope,
} from "../../common/session/current-organization";
import { can } from "../rbac/authorize";
import { entitlementFor } from "../billing/entitlement";
import { recordAudit } from "../audit";
import { materializeResult } from "../query-result/cache";
import { widgetPoints } from "../dashboard/widget-data";
import type { IQueryResponse } from "../query/contracts";
import type { ChartType } from "../dashboard/contracts";
import type {
  IShareLink,
  IShareLinkListResponse,
  IShareLinkResponse,
  ISharedDashboard,
  ISharedDashboardResponse,
} from "./contracts";

const { dashboard, shareLink, widget } = schema;

const MAX_EXPIRY_DAYS = 365;

const RATE_LIMIT_REQUESTS = 30;

const RATE_LIMIT_WINDOW_MS = 60_000;

const RATE_LIMIT_MAX_CLIENTS = 10_000;

const publicRequests = new Map<string, { count: number; since: number }>();

function rateLimit(client: string): void {
  const now = Date.now();
  for (const [key, entry] of publicRequests) {
    if (now - entry.since >= RATE_LIMIT_WINDOW_MS) {
      publicRequests.delete(key);
    }
  }
  const entry = publicRequests.get(client);
  if (entry === undefined || now - entry.since >= RATE_LIMIT_WINDOW_MS) {
    if (publicRequests.size >= RATE_LIMIT_MAX_CLIENTS) {
      publicRequests.clear();
    }
    publicRequests.set(client, { count: 1, since: now });
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_REQUESTS) {
    throw new TooManyRequestsException(
      "That is a lot of refreshes — try again in a minute",
    );
  }
}

const TOKEN_LENGTH = 10;

const TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function newToken(): string {
  const limit = TOKEN_ALPHABET.length * Math.floor(256 / TOKEN_ALPHABET.length);
  const characters: string[] = [];
  while (characters.length < TOKEN_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(TOKEN_LENGTH))) {
      if (byte < limit) {
        characters.push(TOKEN_ALPHABET.charAt(byte % TOKEN_ALPHABET.length));
        if (characters.length === TOKEN_LENGTH) {
          break;
        }
      }
    }
  }
  return characters.join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function toShareLink(row: typeof shareLink.$inferSelect): IShareLink {
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    expiresAt: row.expiresAt === null ? null : row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

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

async function snapshot(
  name: string,
  dashboardId: string,
  organization: IOrganizationScope,
): Promise<ISharedDashboard> {
  const rows = await organization.db
    .select()
    .from(widget)
    .where(
      and(
        eq(widget.dashboardId, dashboardId),
        organization.where(widget.organizationId),
      ),
    )
    .orderBy(widget.createdAt);
  const grids = new Map<string, IQueryResponse>();
  for (const queryId of new Set(rows.map((row) => row.savedQueryId))) {
    grids.set(queryId, await materializeResult(queryId, organization));
  }

  const widgets = rows.map((row) => ({
    id: row.id,
    title: row.title,
    chartType: row.chartType as ChartType,
    points: widgetPoints(row, grids.get(row.savedQueryId)!),
  }));

  return { name, widgets };
}

export function shareLinkRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/dashboards/:id/share-links", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "shareLink", "create"))) {
      throw new ForbiddenException("Only owners and editors can see share links");
    }

    const found = await oneRow(organization.db, dashboard, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That dashboard does not exist");
    }

    const rows = await organization.db
      .select()
      .from(shareLink)
      .where(
        and(
          eq(shareLink.dashboardId, found.id),
          organization.where(shareLink.organizationId),
        ),
      )
      .orderBy(desc(shareLink.createdAt));

    const body: IShareLinkListResponse = {
      shareLinks: rows.map(toShareLink),
    };
    return c.json(body);
  });

  routes.post("/api/dashboards/:id/share-links", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "shareLink", "create"))) {
      throw new ForbiddenException("Only owners and editors can share dashboards");
    }

    const found = await oneRow(organization.db, dashboard, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That dashboard does not exist");
    }

    const raw = await c.req.json().catch(() => ({}));
    const fields = readBody(raw, "Send the link settings as JSON");
    const expiresInDays = readExpiry(fields);

    const frozen = await snapshot(found.name, found.id, organization);
    const token = newToken();
    const now = new Date();
    const expiresAt =
      expiresInDays === null
        ? null
        : new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000);

    const inserted = await organization.db
      .insert(shareLink)
      .values({
        organizationId: organization.organizationId,
        dashboardId: found.id,
        tokenHash: await hashToken(token),
        snapshot: JSON.stringify(frozen),
        expiresAt,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const row = inserted[0];
    if (row === undefined) {
      throw new NotFoundException("That share link could not be created");
    }

    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "share_link.created",
      targetKind: "share_link",
      targetId: row.id,
      targetLabel: found.name,
    });
    const body: IShareLinkResponse = {
      shareLink: toShareLink(row),
      url: `${config.webUrl}/share/${token}`,
    };
    return c.json(body, 201);
  });
  routes.post("/api/share-links/:id/refresh", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "shareLink", "create"))) {
      throw new ForbiddenException("Only owners and editors can refresh share links");
    }

    const found = await oneRow(organization.db, shareLink, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That share link does not exist");
    }

    const dash = await oneRow(organization.db, dashboard, found.dashboardId, organization);
    if (dash === undefined) {
      throw new NotFoundException("That dashboard no longer exists");
    }

    const frozen = await snapshot(dash.name, dash.id, organization);
    const now = new Date();
    const updated = await organization.db
      .update(shareLink)
      .set({ snapshot: JSON.stringify(frozen), updatedAt: now })
      .where(eq(shareLink.id, found.id))
      .returning();

    const row = updated[0];
    if (row === undefined) {
      throw new NotFoundException("That share link does not exist");
    }
    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "share_link.refreshed",
      targetKind: "share_link",
      targetId: row.id,
      targetLabel: dash.name,
    });
    return c.json(toShareLink(row));
  });
  routes.delete("/api/share-links/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "shareLink", "delete"))) {
      throw new ForbiddenException("Only owners and editors can revoke share links");
    }

    const found = await oneRow(organization.db, shareLink, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That share link does not exist");
    }

    await organization.db.delete(shareLink).where(eq(shareLink.id, found.id));
    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "share_link.deleted",
      targetKind: "share_link",
      targetId: found.id,
    });
    return c.json({ id: found.id });
  });

  return routes;
}

export function publicShareRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/share/:token", async (c) => {
    rateLimit(c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "direct");

    const tokenHash = await hashToken(c.req.param("token"));
    const rows = await c
      .get("db")
      .select()
      .from(shareLink)
      .where(eq(shareLink.tokenHash, tokenHash))
      .limit(1);

    const found = rows[0];
    if (found === undefined) {
      throw new NotFoundException("That link does not work");
    }
    if (found.expiresAt !== null && found.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException("That link has expired");
    }
    const entitlement = await entitlementFor(c.get("db"), found.organizationId);
    if (!entitlement.entitled) {
      throw new NotFoundException("That link does not work");
    }

    const body: ISharedDashboardResponse = {
      dashboard: JSON.parse(found.snapshot) as ISharedDashboard,
    };
    return c.json(body);
  });

  return routes;
}
