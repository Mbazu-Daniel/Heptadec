import { config } from "../../common/config/env";
import { BILLING_CADENCES, type BillingCadence, type IBillingPlan } from "./contracts";

const PLAN_COPY: Record<BillingCadence, { label: string; note: string }> = {
  monthly: { label: "Monthly", note: "Billed every month" },
  yearly: { label: "Yearly", note: "Billed every year, two months free" },
};

export function billingPlans(): IBillingPlan[] {
  return BILLING_CADENCES.map((cadence) => ({
    cadence,
    label: PLAN_COPY[cadence].label,
    amount: config.bachs.prices[cadence],
    currency: config.bachs.currency,
    note: PLAN_COPY[cadence].note,
  }));
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
