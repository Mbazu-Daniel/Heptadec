import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { authFor } from "../../common/config/better-auth";
import { publicBaseFrom } from "../images/urls";
import { completeOnboarding, getMe, listProviders } from "./auth.service";

export function authHandler(c: Context<IAuthVars>) {
  return authFor(c.get("db")).handler(c.req.raw);
}

export async function providersHandler(c: Context<IAuthVars>) {
  return c.json(await listProviders(c.get("db")));
}

export async function meHandler(c: Context<IAuthVars>) {
  const session = c.get("session")!;
  const organization = c.get("organization");
  return c.json(
    await getMe(c.get("db"), {
      session,
      organization,
      publicBase: publicBaseFrom(c.env),
    }),
  );
}

export async function completeOnboardingHandler(c: Context<IAuthVars>) {
  const session = c.get("session")!;
  await completeOnboarding(c.get("db"), { userId: session.user.id });
  return c.json({ user: { id: session.user.id, onboardingCompleted: true } });
}
