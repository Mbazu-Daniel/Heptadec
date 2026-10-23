import { eq } from "drizzle-orm";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import {
  NotFoundException,
  PaymentRequiredException,
} from "../../common/exceptions";
import { billingConfigured, cadenceForProduct } from "./catalog";

const { billingSubscription, billingPayment, organization, user } = schema;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Maximum number of organizations allowed on the free tier. */
export const FREE_TIER_ORG_LIMIT = 1;

export const TRIAL_DAYS = 7;

const STATUSES_WITH_ACCESS = ["trialing", "active", "past_due"];
const PAYMENT_STATUSES_WITH_ACCESS = ["completed", "succeeded", "paid"];

export interface IEntitlement {
  entitled: boolean;
  trialEndsAt: Date;
}

/**
 * Checks if the user associated with the organization has exceeded
 * their free-tier organization limit.
 */
async function checkOrgLimit(
  db: HeptadecDatabase,
  organizationId: string,
): Promise<{ overLimit: boolean; orgCount: number }> {
  // Count organizations; stop after LIMIT+1 to determine if over limit
  const orgCount = await db
    .select({ count: organization.id })
    .from(organization)
    .limit(FREE_TIER_ORG_LIMIT + 1);

  const overLimit = orgCount.length > FREE_TIER_ORG_LIMIT;
  return { overLimit, orgCount: orgCount.length };
}

export async function entitlementFor(
  db: HeptadecDatabase,
  organizationId: string,
): Promise<IEntitlement> {
  const rows = await db
    .select({
      createdAt: organization.createdAt,
      subscription: billingSubscription,
      organizationId: organization.id,
    })
    .from(organization)
    .leftJoin(
      billingSubscription,
      eq(billingSubscription.organizationId, organization.id),
    )
    .where(eq(organization.id, organizationId))
    .limit(1);

  const found = rows[0];
  if (found === undefined) {
    throw new NotFoundException("That organization no longer exists");
  }

  // Free-tier: check if user has exceeded organization limit
  const { overLimit } = await checkOrgLimit(db, organizationId);
  if (overLimit) {
    throw new PaymentRequiredException(
      "Your free organization limit has been reached. Upgrade to a paid plan for more organizations.",
    );
  }

  const trialEndsAt = new Date(found.createdAt.getTime() + TRIAL_DAYS * DAY_MS);
  if (!billingConfigured()) {
    return { entitled: true, trialEndsAt };
  }

  const subscription = found.subscription;
  if (subscription !== null && cadenceForProduct(subscription.productId) !== null) {
    return {
      entitled: STATUSES_WITH_ACCESS.includes(subscription.status),
      trialEndsAt,
    };
  }

  const payments = await db
    .select()
    .from(billingPayment)
    .where(eq(billingPayment.organizationId, organizationId))
    .orderBy(billingPayment.createdAt)
    .limit(1);

  const latest = payments[0];
  if (latest !== undefined && PAYMENT_STATUSES_WITH_ACCESS.includes(latest.status)) {
    return { entitled: true, trialEndsAt };
  }

  return { entitled: Date.now() < trialEndsAt.getTime(), trialEndsAt };
}

export async function requireEntitlement(
  db: HeptadecDatabase,
  organizationId: string,
): Promise<void> {
  const { entitled } = await entitlementFor(db, organizationId);
  if (!entitled) {
    throw new PaymentRequiredException(
      "This organization's trial has ended and it has no active subscription",
    );
  }
}
