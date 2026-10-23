import { eq } from "drizzle-orm";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import {
  NotFoundException,
  PaymentRequiredException,
} from "../../common/exceptions";
import { billingConfigured, cadenceForProduct } from "./catalog";

const { billingSubscription, organization } = schema;

const DAY_MS = 24 * 60 * 60 * 1000;

export const TRIAL_DAYS = 7;

const STATUSES_WITH_ACCESS = ["trialing", "active", "past_due"];

export interface IEntitlement {
  entitled: boolean;
  trialEndsAt: Date;
}

export async function entitlementFor(
  db: HeptadecDatabase,
  organizationId: string,
): Promise<IEntitlement> {
  const rows = await db
    .select({
      createdAt: organization.createdAt,
      subscription: billingSubscription,
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

  const trialEndsAt = new Date(found.createdAt.getTime() + TRIAL_DAYS * DAY_MS);
  if (!billingConfigured()) {
    return { entitled: true, trialEndsAt };
  }

  const subscription = found.subscription;
  // A subscription to one of this app's own products is what pays for access. A
  // subscription to anything else on the same Bachs account is somebody else's
  // sale, and it leaves the organization on its trial.
  if (subscription !== null && cadenceForProduct(subscription.productId) !== null) {
    return {
      entitled: STATUSES_WITH_ACCESS.includes(subscription.status),
      trialEndsAt,
    };
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
