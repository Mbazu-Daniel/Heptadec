import { createMiddleware } from "hono/factory";
import { and, eq } from "drizzle-orm";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import { authFor, type AuthSession } from "../config/better-auth";
import { UnauthorizedException } from "../exceptions";
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
  Bindings: {
    db: HeptadecDatabase;
    // Absent when a deployment binds no R2 bucket: image storage is optional
    // and the image routes report it as unconfigured rather than failing.
    images?: R2Bucket;
    // Signing an upload is an S3 operation, so it needs the bucket's name and
    // the account it lives in, plus an R2 access key. Absent means uploads are
    // not offered; reads still work through the bucket binding above.
    R2_BUCKET_NAME?: string;
    /** The Cloudflare account, which the R2 S3 endpoint is built from. */
    CLOUDFLARE_ACCOUNT_ID?: string;
    R2_ACCESS_KEY_ID?: string;
    R2_SECRET_ACCESS_KEY?: string;
    /** Only for temporary credentials, which the SDK signs alongside the key. */
    R2_SESSION_TOKEN?: string;
    // The bucket's public base, so an image is read straight from the edge
    // instead of through a Worker invocation. Absent falls back to proxying.
    R2_PUBLIC_ID?: string;
    R2_CUSTOM_DOMAIN?: string;
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
