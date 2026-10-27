import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import {
  billingCustomer,
  billingPayment,
  type HeptadecDatabase,
} from "@heptadec/db";
import { config } from "../../common/config/env";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  activeOrganization,
  type IOrganizationScope,
} from "../../common/session/current-organization";
import { readBody, readOptionalString } from "../../common/http/body";
import {
  BadRequestException,
  InternalServerException,
  UnauthorizedException,
} from "../../common/exceptions";
import { requireOwner } from "../rbac/owner";
import { recordAudit } from "../audit";
import { billingConfigured, billingPlans, daysFor, priceFor } from "./catalog";
import { createCheckoutSession, createCustomer } from "./client";
import { entitlementFor } from "./entitlement";
import {
  readBillingEvent,
  type ICardSavedEvent,
  type IFailedEvent,
  type IPaidEvent,
} from "./event";
import { stopAutoRenew } from "./renewal";
import { isBillingCadence, type IBillingSummary, type ISetAutoRenewResponse, type IStartCheckoutResponse } from "./contracts";
import { isSignedDelivery } from "./signature";

const DAY_MS = 24 * 60 * 60 * 1000;

export function billingRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/billing", requireSession, async (c) => {
    const organization = activeOrganization(c);
    const entitlement = await entitlementFor(
      organization.db,
      organization.organizationId,
    );
    const rows = await organization.db
      .select()
      .from(billingCustomer)
      .where(organization.where(billingCustomer.organizationId))
      .limit(1);
    const customer = rows[0];

    const body: IBillingSummary = {
      configured: billingConfigured(),
      entitled: entitlement.entitled,
      trialEndsAt: entitlement.trialEndsAt.toISOString(),
      paidUntil:
        entitlement.paidUntil === null
          ? null
          : entitlement.paidUntil.toISOString(),
      cadence: entitlement.cadence,
      autoRenew:
        customer !== undefined &&
        customer.autoRenew &&
        customer.paymentMethodId !== null,
      hasCard: customer !== undefined && customer.paymentMethodId !== null,
      cardLast4: customer?.cardLast4 ?? null,
      plans: billingPlans(),
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
    if (cadence === undefined || !isBillingCadence(cadence)) {
      throw new BadRequestException("Choose a plan");
    }

    const session = c.get("session");
    if (session === null) {
      throw new UnauthorizedException();
    }

    const customerId = await customerFor(organization, {
      email: session.user.email,
      name: session.user.name,
    });
    const checkoutUrl = await createCheckoutSession({
      customerId,
      amount: priceFor(cadence),
      metadata: {
        organization_id: organization.organizationId,
        cadence,
      },
    });
    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "billing.checkout_started",
      targetKind: "billing_payment",
      targetLabel: cadence,
    });

    const response: IStartCheckoutResponse = { checkoutUrl };
    return c.json(response);
  });

  routes.post("/api/billing/auto-renew", requireSession, async (c) => {
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

    const rows = await organization.db
      .select()
      .from(billingCustomer)
      .where(organization.where(billingCustomer.organizationId))
      .limit(1);
    const customer = rows[0];
    if (customer === undefined) {
      throw new BadRequestException(
        "Start a checkout before choosing auto-renew",
      );
    }
    if (enabled && customer.paymentMethodId === null) {
      throw new BadRequestException(
        "A saved card is needed to renew automatically",
      );
    }

    await organization.db
      .update(billingCustomer)
      .set({ autoRenew: enabled, pendingChargeId: null, updatedAt: new Date() })
      .where(organization.where(billingCustomer.organizationId));
    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "billing.auto_renew_changed",
      targetKind: "billing_customer",
      targetLabel: enabled ? "on" : "off",
    });

    const response: ISetAutoRenewResponse = { autoRenew: enabled };
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

    const event = readBillingEvent(raw);
    if (event === null) {
      return c.json({ received: true });
    }

    const db = c.get("db");
    if (event.kind === "card") {
      await storeCard(db, event);
    } else if (event.kind === "paid") {
      await storePayment(db, event);
    } else {
      await storeFailure(db, event);
    }
    return c.json({ received: true });
  });

  return routes;
}

async function customerFor(
  organization: IOrganizationScope,
  person: { email: string; name: string },
): Promise<string> {
  const rows = await organization.db
    .select()
    .from(billingCustomer)
    .where(organization.where(billingCustomer.organizationId))
    .limit(1);
  const existing = rows[0];
  if (existing !== undefined) {
    return existing.customerId;
  }

  const customerId = await createCustomer({
    email: person.email,
    name: person.name,
    organizationId: organization.organizationId,
  });
  const now = new Date();
  await organization.db
    .insert(billingCustomer)
    .values({
      organizationId: organization.organizationId,
      customerId,
      autoRenew: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  const stored = await organization.db
    .select()
    .from(billingCustomer)
    .where(organization.where(billingCustomer.organizationId))
    .limit(1);
  if (stored[0] === undefined) {
    throw new InternalServerException("The Bachs customer was not stored");
  }
  return stored[0].customerId;
}

async function storeCard(
  db: HeptadecDatabase,
  event: ICardSavedEvent,
): Promise<void> {
  const rows = await db
    .select()
    .from(billingCustomer)
    .where(eq(billingCustomer.customerId, event.customerId))
    .limit(1);
  const customer = rows[0];
  if (customer === undefined) {
    return;
  }
  await db
    .update(billingCustomer)
    .set({
      paymentMethodId: event.paymentMethodId,
      cardBrand: event.cardBrand,
      cardLast4: event.cardLast4,
      autoRenew: true,
      updatedAt: new Date(),
    })
    .where(eq(billingCustomer.id, customer.id));
}

async function storePayment(
  db: HeptadecDatabase,
  event: IPaidEvent,
): Promise<void> {
  const organizationId = event.organizationId;
  const cadence = event.cadence;
  const checkoutId = event.checkoutId;
  const chargeId = event.chargeId;
  let paidWith: { kind: "checkout" | "charge"; id: string } | null = null;
  if (checkoutId !== null) {
    paidWith = { kind: "checkout", id: checkoutId };
  } else if (chargeId !== null) {
    paidWith = { kind: "charge", id: chargeId };
  }
  if (organizationId === null || cadence === null || paidWith === null) {
    return;
  }

  await db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: billingPayment.id })
      .from(billingPayment)
      .where(
        paidWith.kind === "checkout"
          ? eq(billingPayment.checkoutId, paidWith.id)
          : eq(billingPayment.chargeId, paidWith.id),
      )
      .limit(1);
    if (existing.length > 0) {
      return;
    }

    const latest = await tx
      .select({ periodEndsAt: billingPayment.periodEndsAt })
      .from(billingPayment)
      .where(eq(billingPayment.organizationId, organizationId))
      .orderBy(desc(billingPayment.periodEndsAt))
      .limit(1);
    const now = new Date();
    const previousEnd = latest[0]?.periodEndsAt ?? null;
    const startsAt =
      previousEnd !== null && previousEnd.getTime() > now.getTime()
        ? previousEnd
        : now;
    const periodEndsAt = new Date(
      startsAt.getTime() + daysFor(cadence) * DAY_MS,
    );

    await tx.insert(billingPayment).values({
      organizationId,
      customerId: event.customerId,
      checkoutId,
      chargeId,
      cadence,
      amount: event.amount,
      currency: event.currency,
      status: event.status,
      periodEndsAt,
      createdAt: now,
    });
    await tx
      .update(billingCustomer)
      .set({ pendingChargeId: null, updatedAt: now })
      .where(eq(billingCustomer.organizationId, organizationId));
  });
}

async function storeFailure(
  db: HeptadecDatabase,
  event: IFailedEvent,
): Promise<void> {
  if (event.chargeId !== null) {
    const pending = await db
      .select()
      .from(billingCustomer)
      .where(eq(billingCustomer.pendingChargeId, event.chargeId))
      .limit(1);
    if (pending[0] !== undefined) {
      await stopAutoRenew(db, pending[0].id, new Date());
      return;
    }
  }

  if (event.customerId === null) {
    return;
  }
  const byCustomer = await db
    .select()
    .from(billingCustomer)
    .where(eq(billingCustomer.customerId, event.customerId))
    .limit(1);
  if (byCustomer[0] !== undefined) {
    await stopAutoRenew(db, byCustomer[0].id, new Date());
  }
}
