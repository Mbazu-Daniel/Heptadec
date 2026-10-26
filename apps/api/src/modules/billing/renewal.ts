import { desc, eq } from "drizzle-orm";
import { billingCustomer, billingPayment, type HeptadecDatabase } from "@heptadec/db";
import { isBillingCadence } from "./contracts";
import { billingConfigured, priceFor } from "./catalog";
import { createRenewalCharge } from "./client";
import { entitlementFor } from "./entitlement";

const PENDING_CHARGE_TTL_MS = 60 * 60 * 1000;

export async function checkBillingRenewals(
  db: HeptadecDatabase,
  now: Date,
): Promise<number> {
  if (!billingConfigured()) {
    return 0;
  }

  const customers = await db
    .select()
    .from(billingCustomer)
    .where(eq(billingCustomer.autoRenew, true));
  let submitted = 0;

  for (const customer of customers) {
    if (customer.paymentMethodId === null) {
      continue;
    }
    if (
      customer.pendingChargeId !== null &&
      now.getTime() - customer.updatedAt.getTime() < PENDING_CHARGE_TTL_MS
    ) {
      continue;
    }

    const entitlement = await entitlementFor(db, customer.organizationId);
    if (entitlement.entitled) {
      continue;
    }

    const latest = await db
      .select({ id: billingPayment.id, cadence: billingPayment.cadence })
      .from(billingPayment)
      .where(eq(billingPayment.organizationId, customer.organizationId))
      .orderBy(desc(billingPayment.createdAt))
      .limit(1);

    const paid = latest[0];
    if (
      paid === undefined ||
      paid.cadence === null ||
      !isBillingCadence(paid.cadence)
    ) {
      continue;
    }

    try {
      const charge = await createRenewalCharge({
        customerId: customer.customerId,
        paymentMethodId: customer.paymentMethodId,
        amount: priceFor(paid.cadence),
        reference: `renewal-${customer.organizationId}-${paid.id}`,
        metadata: {
          organization_id: customer.organizationId,
          cadence: paid.cadence,
        },
      });
      if (charge.status === "failed") {
        await stopAutoRenew(db, customer.id, now);
        continue;
      }
      await db
        .update(billingCustomer)
        .set({ pendingChargeId: charge.chargeId, updatedAt: now })
        .where(eq(billingCustomer.id, customer.id));
      submitted += 1;
    } catch (caught) {
      console.error(
        `[billing] renewal for ${customer.organizationId} could not start:`,
        caught,
      );
    }
  }

  return submitted;
}

export async function stopAutoRenew(
  db: HeptadecDatabase,
  billingCustomerId: string,
  now: Date,
): Promise<void> {
  await db
    .update(billingCustomer)
    .set({ autoRenew: false, pendingChargeId: null, updatedAt: now })
    .where(eq(billingCustomer.id, billingCustomerId));
}
