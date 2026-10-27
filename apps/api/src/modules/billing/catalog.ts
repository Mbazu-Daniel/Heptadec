import { config } from "../../common/config/env";
import {
  BILLING_CADENCES,
  type BillingCadence,
  type IBillingPlan,
} from "./contracts";

export const BILLING_CURRENCY = "USD";

const PLAN_COPY: Record<
  BillingCadence,
  { label: string; note: string; days: number }
> = {
  monthly: { label: "Monthly", note: "30 days of access", days: 30 },
  yearly: { label: "Yearly", note: "365 days of access, two months free", days: 365 },
};

const PRICE = /^\d+\.\d{2}$/;

export function billingPlans(): IBillingPlan[] {
  return BILLING_CADENCES.map((cadence) => ({
    cadence,
    label: PLAN_COPY[cadence].label,
    amount: config.bachs.prices[cadence],
    currency: BILLING_CURRENCY,
    note: PLAN_COPY[cadence].note,
  }));
}

export function priceFor(cadence: BillingCadence): string {
  return config.bachs.prices[cadence];
}

export function daysFor(cadence: BillingCadence): number {
  return PLAN_COPY[cadence].days;
}

export function billingConfigured(): boolean {
  return (
    config.bachs.secretKey !== "" &&
    config.bachs.webhookSecret !== "" &&
    PRICE.test(config.bachs.prices.monthly) &&
    PRICE.test(config.bachs.prices.yearly)
  );
}
