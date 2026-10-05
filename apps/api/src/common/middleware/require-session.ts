import { createMiddleware } from "hono/factory";
import { auth, type AuthSession } from "../config/better-auth";
import { UnauthorizedException } from "../exceptions";

export interface IAuthVars {
  Variables: {
    session: AuthSession | null;
  };
}

export const requireSession = createMiddleware<IAuthVars>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set("session", session);
  if (!session) {
    throw new UnauthorizedException();
  }
  await next();
});