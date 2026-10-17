import { config } from "../../common/config/env";
import { BILLING_CADENCES, type BillingCadence, type IBillingPlan } from "./contracts";

/**
 * The amounts Heptadec advertises, in the primary currency of the Bachs
 * product behind each cadence. Bachs charges what its own catalog says, so the
 * two agreeing is a fact a deployment sets up rather than one this file proves.
 */
const PLANS: Record<BillingCadence, IBillingPlan> = {
  monthly: {
    cadence: "monthly",
    label: "Monthly",
    amount: "5.00",
    currency: "USD",
    note: "Billed every month",
  },
  yearly: {
    cadence: "yearly",
    label: "Yearly",
    amount: "50.00",
    currency: "USD",
    note: "Billed every year, two months free",
  },
};

export function billingPlans(): IBillingPlan[] {
  return BILLING_CADENCES.map((cadence) => PLANS[cadence]);
}

/** Whether this deployment can start a checkout at all. */
export function billingConfigured(): boolean {
  return (
    config.bachs.secretKey !== "" &&
    config.bachs.products.monthly !== "" &&
    config.bachs.products.yearly !== ""
  );
}

export function productIdFor(cadence: BillingCadence): string {
  return cadence === "monthly"
    ? config.bachs.products.monthly
    : config.bachs.products.yearly;
}

/**
 * Which cadence a subscription bills, from the product it names. A product this
 * deployment does not sell is not one of its plans, so it has no cadence.
 */
export function cadenceForProduct(productId: string): BillingCadence | null {
  const known = BILLING_CADENCES.find((cadence) => productIdFor(cadence) === productId);
  return known ?? null;
}
