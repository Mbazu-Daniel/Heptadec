import { Hono } from "hono";

import {
  requireOrganization,
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  billingWebhookHandler,
  getBillingSummaryHandler,
  setAutoRenewHandler,
  startCheckoutHandler,
} from "./billing.controller";

export function billingRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/v1/organization/:organizationId/billing", requireSession, requireOrganization, getBillingSummaryHandler);
  routes.post("/api/v1/organization/:organizationId/billing/checkout", requireSession, requireOrganization, startCheckoutHandler);
  routes.post("/api/v1/organization/:organizationId/billing/auto-renew", requireSession, requireOrganization, setAutoRenewHandler);
  routes.post("/api/webhooks/bachs", billingWebhookHandler);

  return routes;
}
