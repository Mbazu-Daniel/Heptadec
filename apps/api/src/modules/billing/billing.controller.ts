import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import { readBody, readOptionalString } from "../../common/http/body";
import {
  BadRequestException,
  UnauthorizedException,
} from "../../common/exceptions/index";
import { requireOwner } from "../rbac/owner";
import { recordAudit } from "../audit/index";
import { billingConfigured } from "./catalog";
import { isBillingCadence } from "./contracts";
import {
  billingSummary,
  handleBillingWebhook,
  setAutoRenew,
  startCheckout,
} from "./billing.service";

export async function getBillingSummaryHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  const session = c.get("session");
  if (session === null) {
    throw new UnauthorizedException();
  }
  return c.json(
    await billingSummary(organization, { userId: session.user.id }),
  );
}

export async function startCheckoutHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  requireOwner(c, "Only owners can start a billing checkout");

  if (!billingConfigured()) {
    throw new BadRequestException("Billing is not configured on this deployment");
  }

  const body = readBody(await c.req.json(), "A plan is required");
  const cadence = readOptionalString(body, "cadence", "Choose a plan", 16);
  if (cadence === undefined || !isBillingCadence(cadence)) {
    throw new BadRequestException("Choose a plan");
  }

  const session = c.get("session");
  if (session === null) {
    throw new UnauthorizedException();
  }

  const response = await startCheckout(organization, {
    email: session.user.email,
    name: session.user.name,
    cadence,
  });
  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "billing.checkout_started",
    targetKind: "billing_payment",
    targetLabel: cadence,
  });

  return c.json(response);
}

export async function setAutoRenewHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  requireOwner(c, "Only owners can change auto-renew");

  const body = readBody(
    await c.req.json(),
    "Choose whether the saved card renews",
  );
  const enabled = body.enabled;
  if (typeof enabled !== "boolean") {
    throw new BadRequestException("Choose whether the saved card renews");
  }

  const response = await setAutoRenew(organization, { enabled });
  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "billing.auto_renew_changed",
    targetKind: "billing_customer",
    targetLabel: enabled ? "on" : "off",
  });

  return c.json(response);
}

export async function billingWebhookHandler(c: Context<IAuthVars>) {
  await handleBillingWebhook(c.get("db"), {
    signature: c.req.header("x-bachs-signature-v2") ?? null,
    raw: await c.req.text(),
  });
  return c.json({ received: true });
}
