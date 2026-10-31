import { eq } from "drizzle-orm";
import { organization, type HeptadecDatabase } from "@heptadec/db";
import {
  NotFoundException,
  PaymentRequiredException,
} from "../../common/exceptions";
import { billingConfigured } from "./catalog";
import type { BillingCadence } from "./contracts";
import { currentPeriod, trialEndsAt } from "./period";

export interface IEntitlement {
  entitled: boolean;
  trialEndsAt: Date;
  paidUntil: Date | null;
  cadence: BillingCadence | null;
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

  const trial = trialEndsAt(found.createdAt);
  if (!billingConfigured()) {
    return {
      entitled: true,
      trialEndsAt: trial,
      paidUntil: null,
      cadence: null,
    };
  }

  const period = await currentPeriod(db, organizationId);
  const paidUntil = period?.endsAt ?? null;
  const paid = paidUntil !== null && paidUntil.getTime() > Date.now();
  return {
    entitled: paid || Date.now() < trial.getTime(),
    trialEndsAt: trial,
    paidUntil,
    cadence: period?.cadence ?? null,
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
