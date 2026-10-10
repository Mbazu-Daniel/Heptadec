import { createMiddleware } from "hono/factory";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@heptadec/db";
import { auth, type AuthSession } from "../config/better-auth";
import { UnauthorizedException } from "../exceptions";
import {
  currentOrganizationId,
  type IOrganizationScope,
} from "../session/current-organization";

const { member } = schema;

export interface IAuthVars {
  Variables: {
    session: AuthSession | null;
    organization: IOrganizationScope | null;
  };
}

export const requireSession = createMiddleware<IAuthVars>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("session", session);
  if (!session) {
    throw new UnauthorizedException();
  }
  c.set("organization", await liveOrganization(session));
  await next();
});

async function liveOrganization(
  session: NonNullable<AuthSession>,
): Promise<IOrganizationScope | null> {
  const organizationId = currentOrganizationId(session);
  if (organizationId === null) {
    return null;
  }
  const rows = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.userId, session.user.id),
        eq(member.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    return null;
  }
  return { organizationId, where: (column) => eq(column, organizationId) };
}