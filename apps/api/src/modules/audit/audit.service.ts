import { and, desc, eq, gte, like, lte, or } from "drizzle-orm";
import { auditLog, member, type HeptadecDatabase } from "@heptadec/db";
import { InternalServerException } from "../../common/exceptions/index";
import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import type { IOrganizationScope } from "../../common/session/current-organization";
import type { IAuditLog, IAuditLogListResponse } from "./contracts";
import type {
  IActorSource,
  IAuditInput,
  IAuditLogFilter,
} from "./types";

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

export async function listAuditLogs(
  organization: IOrganizationScope,
  filter: IAuditLogFilter,
): Promise<IAuditLogListResponse> {
  const rows = await organization.db
    .select()
    .from(auditLog)
    .where(
      and(
        organization.where(auditLog.organizationId),
        filter.event ? eq(auditLog.event, filter.event) : undefined,
        filter.target ? eq(auditLog.targetKind, filter.target) : undefined,
        filter.since ? gte(auditLog.occurredAt, filter.since) : undefined,
        filter.until ? lte(auditLog.occurredAt, filter.until) : undefined,
        filter.query === ""
          ? undefined
          : or(
              like(auditLog.event, `%${filter.query}%`),
              like(auditLog.actorLabel, `%${filter.query}%`),
              like(auditLog.targetKind, `%${filter.query}%`),
              like(auditLog.targetLabel, `%${filter.query}%`),
              like(auditLog.detail, `%${filter.query}%`),
            ),
      ),
    )
    .orderBy(desc(auditLog.occurredAt))
    .limit(LIST_LIMIT);

  return { auditLogs: rows.map(toAuditLog) };
}

export async function recordAudit(
  c: Context<IAuthVars>,
  input: IAuditInput,
): Promise<void> {
  const session = c.get("session");
  if (session === null) {
    throw new InternalServerException(
      "recordAudit called outside a session-guarded route",
    );
  }
  const db = c.get("db");
  const displayName = await memberDisplayName(
    db,
    session.user.id,
    input.organizationId,
  );
  await write(
    db,
    input.organizationId,
    session.user.id,
    labelOf(session.user, displayName),
    input,
  );
}

export async function recordAuditFor(
  user: IActorSource,
  db: HeptadecDatabase,
  input: IAuditInput,
): Promise<void> {
  await write(db, input.organizationId, user.id, labelOf(user, null), input);
}

async function memberDisplayName(
  db: HeptadecDatabase,
  userId: string,
  organizationId: string,
): Promise<string | null> {
  const rows = await db
    .select({ displayName: member.displayName })
    .from(member)
    .where(
      and(eq(member.userId, userId), eq(member.organizationId, organizationId)),
    )
    .limit(1);
  return rows[0]?.displayName ?? null;
}

function labelOf(user: IActorSource, displayName: string | null): string {
  const name = (displayName?.trim() ?? user.name?.trim() ?? "").trim();
  return name === "" || name.toLowerCase() === user.email.toLowerCase()
    ? user.email
    : name;
}

async function write(
  db: HeptadecDatabase,
  organizationId: string,
  actorId: string,
  actorLabel: string,
  input: IAuditInput,
): Promise<void> {
  await db.insert(auditLog).values({
    organizationId,
    occurredAt: new Date(),
    actorId,
    actorLabel,
    event: input.event,
    targetKind: input.targetKind,
    targetId: input.targetId ?? null,
    targetLabel: input.targetLabel ?? null,
    detail: input.detail ?? null,
  });
}
