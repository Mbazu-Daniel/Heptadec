import { config } from "../../common/config/env";
import { BILLING_CADENCES, type BillingCadence, type IBillingPlan } from "./contracts";

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

export function cadenceForProduct(productId: string): BillingCadence | null {
  const known = BILLING_CADENCES.find((cadence) => productIdFor(cadence) === productId);
  return known ?? null;
}
