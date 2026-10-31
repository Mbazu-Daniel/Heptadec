export const BILLING_CADENCES = ["monthly", "yearly"] as const;

export type BillingCadence = (typeof BILLING_CADENCES)[number];

export function isBillingCadence(value: string): value is BillingCadence {
  return BILLING_CADENCES.some((cadence) => cadence === value);
}

export interface IBillingPlan {
  cadence: BillingCadence;
  label: string;
  amount: string;
  currency: string;
  note: string;
}

export interface IBillingSummary {
  configured: boolean;
  entitled: boolean;
  trialEndsAt: string;
  paidUntil: string | null;
  cadence: BillingCadence | null;
  autoRenew: boolean;
  hasCard: boolean;
  cardLast4: string | null;
  plans: IBillingPlan[];
}

export interface IStartCheckoutRequest {
  cadence: BillingCadence;
}

export interface IStartCheckoutResponse {
  checkoutUrl: string;
}

export interface ISetAutoRenewRequest {
  enabled: boolean;
}

export interface ISetAutoRenewResponse {
  autoRenew: boolean;
}
