import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db, schema } from "@heptadec/db";
import { auth } from "../../common/config/better-auth";
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

const { user } = schema;

function enabledProviders(): IProvider[] {
  const enabled = Object.keys(auth.options.socialProviders ?? {}) as ProviderId[];
  return enabled.map((id) => ({ id, label: PROVIDERS[id].label }));
}

export function authRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.all("/api/auth/*", (c) => auth.handler(c.req.raw));

  routes.get("/api/providers", (c) => {
    const body: IProvidersResponse = { providers: enabledProviders() };
    return c.json(body);
  });

  routes.get("/api/me", requireSession, (c) => {
    const session = c.get("session")!;
    const body: IMe = {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        onboardingCompleted: session.user.onboardingCompleted ?? false,
      },
    };
    return c.json(body);
  });

  routes.post("/api/onboarding/complete", requireSession, async (c) => {
    const session = c.get("session")!;
    await db
      .update(user)
      .set({ onboardingCompleted: true, updatedAt: new Date() })
      .where(eq(user.id, session.user.id));
    return c.json({ user: { id: session.user.id, onboardingCompleted: true } });
  });

  return routes;
}