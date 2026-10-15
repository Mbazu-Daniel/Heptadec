import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { schema } from "@heptadec/db";
import { authFor } from "../../common/config/better-auth";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  PROVIDERS,
  type IMe,
  type IProvider,
  type IProvidersResponse,
  type ProviderId,
} from "./contracts";
import { currentOrganizationId } from "../../common/session/current-organization";

const { account, member, user } = schema;

function enabledProviders(db: IAuthVars["Bindings"]["db"]): IProvider[] {
  const enabled = Object.keys(
    authFor(db).options.socialProviders ?? {},
  ) as ProviderId[];
  return enabled.map((id) => ({ id, label: PROVIDERS[id].label }));
}

export function authRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.all("/api/auth/*", (c) => authFor(c.get("db")).handler(c.req.raw));

  routes.get("/api/providers", (c) => {
    const body: IProvidersResponse = {
      providers: enabledProviders(c.get("db")),
    };
    return c.json(body);
  });

  routes.get("/api/me", requireSession, async (c) => {
    const session = c.get("session")!;
    const db = c.get("db");
    const organizationId = currentOrganizationId(session);

    const [credential, named] = await Promise.all([
      db
        .select({ id: account.id })
        .from(account)
        .where(
          and(eq(account.userId, session.user.id), eq(account.providerId, "credential")),
        )
        .limit(1),
      organizationId === null
        ? Promise.resolve([])
        : db
            .select({ displayName: member.displayName, image: member.image })
            .from(member)
            .where(
              and(
                eq(member.userId, session.user.id),
                eq(member.organizationId, organizationId),
              ),
            )
            .limit(1),
    ]);

    const body: IMe = {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image ?? null,
        hasPassword: credential.length > 0,
        onboardingCompleted: session.user.onboardingCompleted ?? false,
      },
      displayName: named[0]?.displayName ?? null,
      image: named[0]?.image ?? null,
    };
    return c.json(body);
  });

  routes.post("/api/onboarding/complete", requireSession, async (c) => {
    const session = c.get("session")!;
    const db = c.get("db");
    await db
      .update(user)
      .set({ onboardingCompleted: true, updatedAt: new Date() })
      .where(eq(user.id, session.user.id));
    return c.json({ user: { id: session.user.id, onboardingCompleted: true } });
  });

  return routes;
}