import type { Context } from "hono";
import { auditLog, member, type HeptadecDatabase } from "@heptadec/db";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import { ForbiddenException } from "../../common/exceptions";
import type { AuditEvent, AuditTargetKind } from "./contracts";
import { and, eq } from "drizzle-orm";

export interface IAuditActor {
  id: string;
  label: string;
}

export interface IActorSource {
  id: string;
  name: string;
  email: string;
}

export function auditActorOf(user: IActorSource): IAuditActor {
  const name = user.name.trim();
  return {
    id: user.id,
    label:
      name === "" || name.toLowerCase() === user.email.toLowerCase()
        ? user.email
        : name,
  };
}

export async function auditActor(
  c: Context<IAuthVars>,
  organizationId?: string,
): Promise<IAuditActor> {
  const session = c.get("session");
  if (session === null) {
    throw new Error("auditActor called outside a session-guarded route");
  }
  let orgId = organizationId;
  if (!orgId) {
    try {
      const organization = activeOrganization(c);
      orgId = organization?.organizationId ?? null;
    } catch (e) {
      if (organizationId === undefined) {
        return auditActorOf(session.user);
      }
      throw e;
    }
  }
  if (!orgId) {
    return auditActorOf(session.user);
  }
  const db = c.get("db");
  const rows = await db
    .select({ displayName: member.displayName, userId: member.userId })
    .from(member)
    .where(
      and(
        eq(member.userId, session.user.id),
        eq(member.organizationId, orgId),
      ),
    )
    .limit(1);
  const displayName = rows[0]?.displayName;
  const name = displayName?.trim() ?? session.user.name?.trim() ?? "";
  const label =
    name === "" || name.toLowerCase() === session.user.email.toLowerCase()
      ? session.user.email
      : name;
  return { id: session.user.id, label };
}

export async function recordAudit(
  db: HeptadecDatabase,
  input: {
    organizationId: string;
    actorId: string;
    actorLabel: string;
    event: AuditEvent;
    targetKind: AuditTargetKind;
    targetId?: string;
    targetLabel?: string;
    detail?: string;
  },
): Promise<void> {
  await db.insert(auditLog).values({
    organizationId: input.organizationId,
    occurredAt: new Date(),
    actorId: input.actorId,
    actorLabel: input.actorLabel,
    event: input.event,
    targetKind: input.targetKind,
    targetId: input.targetId ?? null,
    targetLabel: input.targetLabel ?? null,
    detail: input.detail ?? null,
  });
}
