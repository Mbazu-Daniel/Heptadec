import { createMiddleware } from "hono/factory";
import type { IAuthVars } from "./require-session";

export const database = createMiddleware<IAuthVars>(async (c, next) => {
  c.set("db", c.env.db);
  await next();
});
