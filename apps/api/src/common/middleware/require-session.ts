import { createMiddleware } from "hono/factory";
import { and, eq } from "drizzle-orm";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import { authFor, type AuthSession } from "../config/better-auth";
import { UnauthorizedException } from "../exceptions";
import type { IDeploymentBindings } from "../config/deployment";
import {
  currentOrganizationId,
  organizationScope,
  type IRequestScope,
} from "../session/current-organization";

export interface IAuthVars {
  Variables: {
    db: HeptadecDatabase;
    session: AuthSession | null;
    organization: IRequestScope | null;
  };
  Bindings: IDeploymentBindings;
}

const { member } = schema;

export const requireSession = createMiddleware<IAuthVars>(async (c, next) => {
  // The Subscription Gate reads the session before the route does, so the
  // session and the membership are resolved once per request rather than once
  // per layer that asks for them.
  if (c.get("session") !== undefined) {
    await next();
    return;
  }
  const db = c.get("db");
  const session = await authFor(db).api.getSession({ headers: c.req.raw.headers });
  c.set("session", session);
  if (!session) {
    throw new UnauthorizedException();
  }
  c.set("organization", await liveOrganization(db, session));
  await next();
});

async function liveOrganization(
  db: HeptadecDatabase,
  session: NonNullable<AuthSession>,
): Promise<IRequestScope | null> {
  const organizationId = currentOrganizationId(session);
  if (organizationId === null) {
    return null;
  }
  const rows = await db
    .select({
      id: member.id,
      role: member.role,
      displayName: member.displayName,
      image: member.image,
    })
    .from(member)
    .where(
      and(
        eq(member.userId, session.user.id),
        eq(member.organizationId, organizationId),
      ),
    )
    .limit(1);
  const caller = rows[0];
  if (caller === undefined) {
    return null;
  }
  return { ...organizationScope(db, organizationId), caller };
}
