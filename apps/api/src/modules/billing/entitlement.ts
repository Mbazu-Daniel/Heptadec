import { desc, eq } from "drizzle-orm";
import {
  billingPayment,
  organization,
  type HeptadecDatabase,
} from "@heptadec/db";
import {
  NotFoundException,
  PaymentRequiredException,
} from "../../common/exceptions";
import { billingConfigured } from "./catalog";
import type { BillingCadence } from "./contracts";

const DAY_MS = 24 * 60 * 60 * 1000;

export const FREE_TIER_ORG_LIMIT = 1;

export const TRIAL_DAYS = 7;

export interface IEntitlement {
  entitled: boolean;
  trialEndsAt: Date;
  paidUntil: Date | null;
  cadence: BillingCadence | null;
  overLimit: boolean;
}

async function overOrganizationLimit(db: HeptadecDatabase): Promise<boolean> {
  const organizations = await db
    .select({ id: organization.id })
    .from(organization)
    .limit(FREE_TIER_ORG_LIMIT + 1);
  return organizations.length > FREE_TIER_ORG_LIMIT;
}

export async function entitlementFor(
  db: HeptadecDatabase,
  organizationId: string,
): Promise<IEntitlement> {
  const rows = await db
    .select({ createdAt: organization.createdAt })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);

  const found = rows[0];
  if (found === undefined) {
    throw new NotFoundException("That organization no longer exists");
  }

  const overLimit = await overOrganizationLimit(db);

  const trialEndsAt = new Date(found.createdAt.getTime() + TRIAL_DAYS * DAY_MS);
  if (!billingConfigured()) {
    return {
      entitled: true,
      trialEndsAt,
      paidUntil: null,
      cadence: null,
      overLimit: false,
    };
  }

  const latest = await db
    .select({
      periodEndsAt: billingPayment.periodEndsAt,
      cadence: billingPayment.cadence,
    })
    .from(billingPayment)
    .where(eq(billingPayment.organizationId, organizationId))
    .orderBy(desc(billingPayment.periodEndsAt))
    .limit(1);

  const paidUntil = latest[0]?.periodEndsAt ?? null;
  const cadence = latest[0]?.cadence ?? null;
  const paid = paidUntil !== null && paidUntil.getTime() > Date.now();
  return {
    entitled: paid || Date.now() < trialEndsAt.getTime(),
    trialEndsAt,
    paidUntil,
    cadence,
    overLimit,
  };
}

export async function requireEntitlement(
  db: HeptadecDatabase,
  organizationId: string,
): Promise<void> {
  const { entitled } = await entitlementFor(db, organizationId);
  if (!entitled) {
    throw new PaymentRequiredException(
      "This organization's trial has ended and it has no paid period",
    );
  }
}
