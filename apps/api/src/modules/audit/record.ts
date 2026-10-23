import type { Context } from "hono";
import { auditLog, member, type HeptadecDatabase } from "@heptadec/db";
import type { IAuthVars } from "../../common/middleware/require-session";
import type { AuditEvent, AuditTargetKind } from "./contracts";
import { and, eq } from "drizzle-orm";

/** The shape any audit-writing caller passes: an id, a name, an email. */
export interface IActorSource {
  id: string;
  name: string;
  email: string;
}

interface IAuditInput {
  organizationId: string;
  event: AuditEvent;
  targetKind: AuditTargetKind;
  targetId?: string;
  targetLabel?: string;
  detail?: string;
}

/**
 * Records that something happened, and who did it.
 *
 * The actor is the session's own, so no caller has to name one: the label is
 * the display name the person has inside the organization, and falls back to
 * the name on the account.
 */
export async function recordAudit(
  c: Context<IAuthVars>,
  input: IAuditInput,
): Promise<void> {
  const session = c.get("session");
  if (session === null) {
    throw new Error("recordAudit called outside a session-guarded route");
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

/**
 * Records that something happened, and who did it, for somebody who is not in
 * a session: an account that has just been created, an invitation.
 */
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
