import { createMiddleware } from "hono/factory";
import { and, eq } from "drizzle-orm";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import { authFor, type AuthSession } from "../config/better-auth";
import { UnauthorizedException } from "../exceptions";
import {
  currentOrganizationId,
  type IOrganizationScope,
} from "../session/current-organization";

export interface IAuthVars {
  Variables: {
    db: HeptadecDatabase;
    session: AuthSession | null;
    organization: IOrganizationScope | null;
  };
  Bindings: {
    db: HeptadecDatabase;
    // Absent when a deployment binds no R2 bucket: image storage is optional
    // and the image routes report it as unconfigured rather than failing.
    images?: R2Bucket;
    // Signing an upload is an S3 operation, so it needs the bucket's name and
    // the account it lives in, plus an R2 access key. Absent means uploads are
    // not offered; reads still work through the bucket binding above.
    R2BucketName?: string;
    R2AccountId?: string;
    R2AccessKeyId?: string;
    R2SecretAccessKey?: string;
    /** Only for temporary credentials, which the SDK signs alongside the key. */
    R2SessionToken?: string;
  };
}

const { member } = schema;

export const requireSession = createMiddleware<IAuthVars>(async (c, next) => {
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
  return { organizationId, db, where: (column) => eq(column, organizationId) };
}
