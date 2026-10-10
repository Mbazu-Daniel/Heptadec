import type { Context } from "hono";
import { db, auditLog } from "@heptadec/db";
import type { IAuthVars } from "../../common/middleware/require-session";
import type { AuditEvent, AuditTargetKind } from "./contracts";

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

export function auditActor(c: Context<IAuthVars>): IAuditActor {
  const session = c.get("session");
  if (session === null) {
    throw new Error("auditActor called outside a session-guarded route");
  }
  return auditActorOf(session.user);
}

export async function recordAudit(input: {
  organizationId: string;
  actorId: string;
  actorLabel: string;
  event: AuditEvent;
  targetKind: AuditTargetKind;
  targetId?: string;
  targetLabel?: string;
  detail?: string;
}): Promise<void> {
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
