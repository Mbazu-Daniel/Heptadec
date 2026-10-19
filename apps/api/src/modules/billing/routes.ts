import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { schema, type BillingSubscriptionRow, type HeptadecDatabase } from "@heptadec/db";
import { config } from "../../common/config/env";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import { readBody, readString } from "../../common/http/body";
import {
  BadRequestException,
  InternalServerException,
  UnauthorizedException,
} from "../../common/exceptions";
import { requireOwner } from "../rbac/owner";
import { auditActor, recordAudit } from "../audit";
import { billingConfigured, billingPlans, cadenceForProduct, productIdFor } from "./catalog";
import { createCheckoutSession } from "./client";
import { readSubscriptionEvent, type ISubscriptionEvent } from "./event";
import { isSignedDelivery } from "./signature";
import {
  isBillingCadence,
  type IBillingSubscription,
  type IBillingSummary,
  type IStartCheckoutResponse,
} from "./contracts";

const { billingSubscription } = schema;

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

    const body: IBillingSummary = {
      configured: billingConfigured(),
      plans: billingPlans(),
      subscription: row === undefined ? null : toSubscription(row),
    };
    return c.json(body);
  });

  routes.post("/api/billing/checkout", requireSession, async (c) => {
    const organization = activeOrganization(c);
    await requireOwner(
      organization.db,
      c.req.raw.headers,
      "Only owners can start a subscription",
    );

    if (!billingConfigured()) {
      throw new BadRequestException("Billing is not configured on this deployment");
    }

    const body = readBody(await c.req.json(), "A plan is required");
    const cadence = readString(body, "cadence", "Choose a plan", 16);
    if (!isBillingCadence(cadence)) {
      throw new BadRequestException(`${cadence} is not a plan`);
    }

    const session = c.get("session");
    if (session === null) {
      throw new UnauthorizedException();
    }

    const checkoutUrl = await createCheckoutSession({
      productId: productIdFor(cadence),
      email: session.user.email,
      name: session.user.name,
      organizationId: organization.organizationId,
    });

    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "billing.checkout_started",
      targetKind: "billing_subscription",
      targetLabel: cadence,
    });

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
      throw new BadRequestException("That delivery is not signed by Bachs");
    }

    const event = readSubscriptionEvent(raw);
    if (event === null) {
      return c.json({ received: true });
    }
    await store(c.get("db"), event);
    return c.json({ received: true });
  });

  return routes;
}

async function store(db: HeptadecDatabase, event: ISubscriptionEvent): Promise<void> {
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

function toSubscription(row: BillingSubscriptionRow): IBillingSubscription {
  return {
    status: row.status,
    cadence: cadenceForProduct(row.productId),
    renewsAt: row.currentPeriodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
  };
}
