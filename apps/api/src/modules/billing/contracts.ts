export const BILLING_CADENCES = ["monthly", "yearly"] as const;

export type BillingCadence = (typeof BILLING_CADENCES)[number];

export function isBillingCadence(value: string): value is BillingCadence {
  return (BILLING_CADENCES as readonly string[]).includes(value);
}

export interface IBillingPlan {
  cadence: BillingCadence;
  label: string;
  amount: string;
  currency: string;
  note: string;
}

export interface IBillingSubscription {
  status: string;
  cadence: BillingCadence | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface IBillingSummary {
  configured: boolean;
  entitled: boolean;
  trialEndsAt: string;
  plans: IBillingPlan[];
  subscription: IBillingSubscription | null;
}

export interface IStartCheckoutRequest {
  cadence: BillingCadence;
}

export interface IStartCheckoutResponse {
  checkoutUrl: string;
}
