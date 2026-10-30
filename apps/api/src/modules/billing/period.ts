import { desc, eq } from "drizzle-orm";
import { billingPayment, type HeptadecDatabase } from "@heptadec/db";
import { daysFor } from "./catalog";
import type { BillingCadence } from "./contracts";

const DAY_MS = 24 * 60 * 60 * 1000;

export const TRIAL_DAYS = 7;

export const ORGANIZATION_METADATA_KEY = "organization_id";

export const CADENCE_METADATA_KEY = "cadence";

export interface IPaidPeriod {
  paymentId: string;
  cadence: BillingCadence;
  endsAt: Date;
}

export function trialEndsAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + TRIAL_DAYS * DAY_MS);
}

export function extendedPeriod(
  endsAt: Date | null,
  now: Date,
  cadence: BillingCadence,
): Date {
  const startsAt = endsAt !== null && endsAt.getTime() > now.getTime() ? endsAt : now;
  return new Date(startsAt.getTime() + daysFor(cadence) * DAY_MS);
}

export async function currentPeriod(
  db: HeptadecDatabase,
  organizationId: string,
): Promise<IPaidPeriod | null> {
  const rows = await db
    .select({
      paymentId: billingPayment.id,
      cadence: billingPayment.cadence,
      endsAt: billingPayment.periodEndsAt,
    })
    .from(billingPayment)
    .where(eq(billingPayment.organizationId, organizationId))
    .orderBy(desc(billingPayment.periodEndsAt), desc(billingPayment.createdAt))
    .limit(1);

  const row = rows[0];
  if (row === undefined || row.cadence === null || row.endsAt === null) {
    return null;
  }
  return { paymentId: row.paymentId, cadence: row.cadence, endsAt: row.endsAt };
}

export function paymentMetadata(
  organizationId: string,
  cadence: BillingCadence,
): Record<string, string> {
  return {
    [ORGANIZATION_METADATA_KEY]: organizationId,
    [CADENCE_METADATA_KEY]: cadence,
  };
}
