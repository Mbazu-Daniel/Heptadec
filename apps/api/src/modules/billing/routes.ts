import { Hono } from "hono";
import { eq } from "drizzle-orm";
import {
  billingSubscription,
  billingPayment,
  type BillingSubscriptionRow,
  type HeptadecDatabase,
} from "@heptadec/db";
import { config } from "../../common/config/env";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import { readBody, readOptionalString, readString } from "../../common/http/body";
import {
  BadRequestException,
  InternalServerException,
  UnauthorizedException,
} from "../../common/exceptions";
import { requireOwner } from "../rbac/owner";
import { recordAudit } from "../audit";
import { billingConfigured, billingPlans, cadenceForProduct, productIdFor, createDisplayCharge } from "./catalog";
import { createCheckoutSession } from "./client";
import { entitlementFor } from "./entitlement";
import { readPaymentEvent, readSubscriptionEvent, type IPaymentEvent, type ISubscriptionEvent } from "./event";
import { isSignedDelivery } from "./signature";
import {
  isBillingCadence,
  type IBillingCharge,
  IBillingPlan,
  type IBillingSubscription,
  type IBillingSummary,
  type IStartCheckoutResponse,
} from "./contracts";

export function billingRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/billing", requireSession, async (c) => {
    const organization = activeOrganization(c);
    const rows = await organization.db
      .select()
      .from(billingSubscription)
      .where(organization.where(billingSubscription.organizationId))
      .limit(1);
    const row = rows[0];

    const entitlement = await entitlementFor(
      organization.db,
      organization.organizationId,
    );
    // Get plans with the target currency from query parameter, if provided
    const targetCurrency = c.req.query("currency");
    const body: IBillingSummary = {
      configured: billingConfigured(),
      entitled: entitlement.entitled,
      trialEndsAt: entitlement.trialEndsAt.toISOString(),
      plans: billingPlans(targetCurrency),
      charges: [],
      subscription: row === undefined ? null : toSubscription(row),
    };
    return c.json(body);
  });

  routes.post("/api/billing/checkout", requireSession, async (c) => {
    const organization = activeOrganization(c);
    requireOwner(c, "Only owners can start a billing checkout");

    if (!billingConfigured()) {
      throw new BadRequestException("Billing is not configured on this deployment");
    }

    const body = readBody(await c.req.json(), "A plan is required");
    const cadence = readOptionalString(body, "cadence", "Choose a plan", 16);
    const charge = body.charge as
      | { amount: string; currency: string; paymentMethods?: string[] }
      | undefined;

    if (!cadence && (!charge || charge.amount === "" || charge.currency === "")) {
      throw new BadRequestException(
        "Provide cadence for a subscription, or amount + currency for a one-time charge",
      );
    }

    const session = c.get("session");
    if (session === null) {
      throw new UnauthorizedException();
    }

    let checkoutUrl: string;
    if (cadence !== undefined && isBillingCadence(cadence)) {
      checkoutUrl = await createCheckoutSession({
        productId: productIdFor(cadence),
        email: session.user.email,
        name: session.user.name,
        organizationId: organization.organizationId,
      });
      await recordAudit(c, {
        organizationId: organization.organizationId,
        event: "billing.checkout_started",
        targetKind: "billing_subscription",
        targetLabel: cadence,
      });
    } else {
      if (!charge) {
        throw new BadRequestException(
          "Provide cadence for a subscription, or amount + currency for a one-time charge",
        );
      }
      // Convert the charge amount from USD to the target currency for display,
      // but send the USD amount to Bachs (which charges in USD)
      const checkoutPricing = createDisplayCharge(charge.amount, charge.currency);
      checkoutUrl = await createCheckoutSession({
        pricing: {
          currency: checkoutPricing.currency,
          amount: charge.amount, // Send USD amount to Bachs
        },
        paymentMethodTypes: charge.paymentMethods,
        email: session.user.email,
        name: session.user.name,
        organizationId: organization.organizationId,
      });
      await recordAudit(c, {
        organizationId: organization.organizationId,
        event: "billing.charge_started",
        targetKind: "billing_payment",
        targetLabel: `${charge.currency} ${charge.amount}`,
      });
    }

    const response: IStartCheckoutResponse = { checkoutUrl };
    return c.json(response);
  });

  routes.post("/api/webhooks/bachs", async (c) => {
    if (config.bachs.webhookSecret === "") {
      throw new InternalServerException("Billing webhooks are not configured");
    }
    const raw = await c.req.text();
    const signed = await isSignedDelivery(
      c.req.header("x-bachs-signature-v2") ?? null,
      raw,
      config.bachs.webhookSecret,
    );
    if (!signed) {
      throw new BadRequestException("That delivery is not signed");
    }

    const subscription = readSubscriptionEvent(raw);
    if (subscription !== null) {
      await storeSubscription(c.get("db"), subscription);
      return c.json({ received: true });
    }

    const payment = readPaymentEvent(raw);
    if (payment !== null) {
      await storePayment(c.get("db"), payment);
      return c.json({ received: true });
    }

    return c.json({ received: true });
  });

  return routes;
}

async function storeSubscription(
  db: HeptadecDatabase,
  event: ISubscriptionEvent,
): Promise<void> {
  const rows = await db
    .select()
    .from(billingSubscription)
    .where(eq(billingSubscription.organizationId, event.organizationId))
    .limit(1);
  const existing = rows[0];
  if (existing !== undefined && existing.eventCreatedAt > event.occurredAt) {
    return;
  }

  const now = new Date();
  const state = {
    customerId: event.customerId,
    subscriptionId: event.subscriptionId,
    productId: event.productId,
    status: event.status,
    currentPeriodEnd: event.currentPeriodEnd,
    cancelAtPeriodEnd: event.cancelAtPeriodEnd,
    eventCreatedAt: event.occurredAt,
    updatedAt: now,
  };
  await db
    .insert(billingSubscription)
    .values({ organizationId: event.organizationId, createdAt: now, ...state })
    .onConflictDoUpdate({
      target: billingSubscription.organizationId,
      set: state,
    });
}

async function storePayment(db: HeptadecDatabase, event: IPaymentEvent): Promise<void> {
  const now = new Date();
  await db.insert(billingPayment).values({
    id: crypto.randomUUID(),
    organizationId: event.organizationId,
    customerId: event.customerId,
    checkoutId: event.checkoutId,
    amount: event.amount,
    currency: event.currency,
    status: event.status,
    periodEndsAt: null,
    createdAt: now,
  });
}

function toSubscription(row: BillingSubscriptionRow): IBillingSubscription {
  return {
    status: row.status,
    cadence: cadenceForProduct(row.productId),
    renewsAt: row.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
  };
}
