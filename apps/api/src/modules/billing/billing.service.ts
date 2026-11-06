import { desc, eq } from "drizzle-orm";
import {
  billingCustomer,
  billingPayment,
  type HeptadecDatabase,
} from "@heptadec/db";
import { config } from "../../common/config/env";
import {
  BadRequestException,
  InternalServerException,
} from "../../common/exceptions/index";
import type { IOrganizationScope } from "../../common/session/current-organization";
import { billingConfigured, billingPlans, priceFor } from "./catalog";
import { createCheckoutSession, createCustomer } from "./client";
import {
  FREE_TIER_ORG_LIMIT,
  accountPayment,
  entitlementFor,
  organizationsOwned,
} from "./entitlement";
import {
  readBillingEvent,
  type ICardSavedEvent,
  type IFailedEvent,
  type IPaidEvent,
} from "./event";
import { extendedPeriod, paymentMetadata } from "./period";
import { stopAutoRenew } from "./renewal";
import { isSignedDelivery } from "./signature";
import type {
  IBillingSummary,
  ISetAutoRenewResponse,
  IStartCheckoutResponse,
} from "./contracts";
import type {
  IBillingSummaryInput,
  IBillingWebhookInput,
  ISetAutoRenewInput,
  IStartCheckoutInput,
} from "./types";

export async function billingSummary(
  organization: IOrganizationScope,
  input: IBillingSummaryInput,
): Promise<IBillingSummary> {
  const entitlement = await entitlementFor(
    organization.db,
    organization.organizationId,
  );
  const account = await accountPayment(organization.db, input.userId);
  const rows = await organization.db
    .select()
    .from(billingCustomer)
    .where(organization.where(billingCustomer.organizationId))
    .limit(1);
  const customer = rows[0];

  return {
    configured: billingConfigured(),
    entitled: entitlement.entitled,
    accountPaid: account.paid,
    paidUntil:
      account.paidUntil === null ? null : account.paidUntil.toISOString(),
    cadence: account.cadence,
    autoRenew:
      customer !== undefined &&
      customer.autoRenew &&
      customer.paymentMethodId !== null,
    hasCard: customer !== undefined && customer.paymentMethodId !== null,
    cardLast4: customer?.cardLast4 ?? null,
    organizationsOwned: await organizationsOwned(organization.db, input.userId),
    freeOrgLimit: FREE_TIER_ORG_LIMIT,
    plans: billingPlans(),
  };
}

export async function startCheckout(
  organization: IOrganizationScope,
  input: IStartCheckoutInput,
): Promise<IStartCheckoutResponse> {
  const customerId = await customerFor(organization, {
    email: input.email,
    name: input.name,
  });
  const checkoutUrl = await createCheckoutSession({
    customerId,
    amount: priceFor(input.cadence),
    metadata: paymentMetadata(organization.organizationId, input.cadence),
  });
  return { checkoutUrl };
}

export async function setAutoRenew(
  organization: IOrganizationScope,
  input: ISetAutoRenewInput,
): Promise<ISetAutoRenewResponse> {
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
  if (input.enabled && customer.paymentMethodId === null) {
    throw new BadRequestException(
      "A saved card is needed to renew automatically",
    );
  }

  await organization.db
    .update(billingCustomer)
    .set({
      autoRenew: input.enabled,
      pendingChargeId: null,
      updatedAt: new Date(),
    })
    .where(organization.where(billingCustomer.organizationId));

  return { autoRenew: input.enabled };
}

export async function handleBillingWebhook(
  db: HeptadecDatabase,
  input: IBillingWebhookInput,
): Promise<void> {
  if (config.bachs.webhookSecret === "") {
    throw new InternalServerException("Billing webhooks are not configured");
  }
  const signed = await isSignedDelivery(
    input.signature,
    input.raw,
    config.bachs.webhookSecret,
  );
  if (!signed) {
    throw new BadRequestException("That delivery is not signed");
  }

  const event = readBillingEvent(input.raw);
  if (event === null) {
    return;
  }

  if (event.kind === "card") {
    await storeCard(db, event);
  } else if (event.kind === "paid") {
    await storePayment(db, event);
  } else {
    await storeFailure(db, event);
  }
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

  const dedup =
    paidWith.kind === "checkout"
      ? eq(billingPayment.checkoutId, paidWith.id)
      : eq(billingPayment.chargeId, paidWith.id);

  const [existing, latest] = await db.batch([
    db
      .select({ id: billingPayment.id })
      .from(billingPayment)
      .where(dedup)
      .limit(1),
    db
      .select({ periodEndsAt: billingPayment.periodEndsAt })
      .from(billingPayment)
      .where(eq(billingPayment.organizationId, organizationId))
      .orderBy(desc(billingPayment.periodEndsAt))
      .limit(1),
  ]);
  if (existing.length > 0) {
    return;
  }

  const now = new Date();
  const periodEndsAt = extendedPeriod(latest[0]?.periodEndsAt ?? null, now, cadence);

  // One atomic batch replaces the interactive transaction the D1 driver would
  // otherwise run as separate BEGIN/…/COMMIT round-trips. A racing duplicate
  // delivery loses on the unique checkout_id/charge_id index and rolls back, so
  // the payment is recorded exactly once.
  await db.batch([
    db.insert(billingPayment).values({
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
    }),
    db
      .update(billingCustomer)
      .set({ pendingChargeId: null, updatedAt: now })
      .where(eq(billingCustomer.organizationId, organizationId)),
  ]);
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
