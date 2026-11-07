import { Hono } from "hono";

import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  authHandler,
  completeOnboardingHandler,
  meHandler,
  providersHandler,
} from "./auth.controller";

export function authRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.all("/api/auth/*", authHandler);
  routes.get("/api/providers", providersHandler);
  routes.get("/api/me", requireSession, meHandler);
  routes.post("/api/onboarding/complete", requireSession, completeOnboardingHandler);

  return routes;
}
