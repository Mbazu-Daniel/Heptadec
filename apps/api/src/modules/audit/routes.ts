import { Hono } from "hono";
import { and, desc, eq, gte, like, lte, or } from "drizzle-orm";
import { db, schema } from "@heptadec/db";
import type { IAuthVars } from "../../common/middleware/require-session";
import { requireSession } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import { BadRequestException } from "../../common/exceptions";
import { requireOwner } from "../rbac/owner";
import { isAuditEvent, isAuditTargetKind, type IAuditLog, type IAuditLogListResponse } from "./contracts";

const { auditLog } = schema;

const LIST_LIMIT = 100;

function toAuditLog(row: typeof auditLog.$inferSelect): IAuditLog {
  return {
    id: row.id,
    occurredAt: row.occurredAt.toISOString(),
    actorId: row.actorId,
    actorLabel: row.actorLabel,
    event: row.event as IAuditLog["event"],
    targetKind: row.targetKind as IAuditLog["targetKind"],
    targetId: row.targetId,
    targetLabel: row.targetLabel,
    detail: row.detail,
  };
}

function readDate(value: string | undefined, message: string): Date | undefined {
  if (value === undefined || value === "") {
    return undefined;
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) {
    throw new BadRequestException(message);
  }
  return new Date(time);
}

export function auditRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/audit-logs", requireSession, async (c) => {
    const organization = activeOrganization(c);

    await requireOwner(
      c.req.raw.headers,
      "Only owners can see the audit log",
    );

    const event = c.req.query("event");
    if (event !== undefined && event !== "" && !isAuditEvent(event)) {
      throw new BadRequestException("That event filter is not a known audit event");
    }
    const target = c.req.query("target");
    if (target !== undefined && target !== "" && !isAuditTargetKind(target)) {
      throw new BadRequestException("That target filter is not a known audit target");
    }
    const since = readDate(c.req.query("since"), "That start date is not valid");
    const until = readDate(c.req.query("until"), "That end date is not valid");
    const q = c.req.query("q")?.trim() ?? "";

    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          organization.where(auditLog.organizationId),
          event ? eq(auditLog.event, event) : undefined,
          target ? eq(auditLog.targetKind, target) : undefined,
          since ? gte(auditLog.occurredAt, since) : undefined,
          until ? lte(auditLog.occurredAt, until) : undefined,
          q === ""
            ? undefined
            : or(
                like(auditLog.event, `%${q}%`),
                like(auditLog.actorLabel, `%${q}%`),
                like(auditLog.targetKind, `%${q}%`),
                like(auditLog.targetLabel, `%${q}%`),
                like(auditLog.detail, `%${q}%`),
              ),
        ),
      )
      .orderBy(desc(auditLog.occurredAt))
      .limit(LIST_LIMIT);

    const body: IAuditLogListResponse = { auditLogs: rows.map(toAuditLog) };
    return c.json(body);
  });

  return routes;
}
