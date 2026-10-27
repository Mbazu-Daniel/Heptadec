import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { billingConfigured } from "./catalog";
import { requireEntitlement } from "./entitlement";

export function subscribed(product: Hono<IAuthVars>): Hono<IAuthVars> {
  const gated = new Hono<IAuthVars>();
  for (const path of routePaths(product)) {
    gated.use(path, requireSession, gate);
  }
  gated.route("/", product);
  return gated;
}

function routePaths(product: Hono<IAuthVars>): string[] {
  const paths = new Set<string>();
  for (const route of product.routes) {
    paths.add(route.path);
  }
  return [...paths];
}

const gate = createMiddleware<IAuthVars>(async (c, next) => {
  const organization = c.get("organization");
  if (billingConfigured() && organization !== null) {
    await requireEntitlement(c.get("db"), organization.organizationId);
  }
  await next();
});
