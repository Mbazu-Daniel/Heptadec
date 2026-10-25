export const BILLING_CADENCES = ["monthly", "yearly"] as const;

export type BillingCadence = (typeof BILLING_CADENCES)[number];

export function isBillingCadence(value: string): value is BillingCadence {
  return (BILLING_CADENCES as readonly string[]).includes(value);
}

/**
 * A subscription plan offered through the app's catalogue.
 * The price and currency are the defaults the app advertises; the underlying
 * Bachs checkout always runs in USD and the app applies the price/currency
 * from the organisation's configured catalogue.
 */
export interface IBillingPlan {
  cadence: BillingCadence;
  label: string;
  amount: string;
  currency: string;
  note: string;
}

/** A one-time charge the organisation can buy right now, in a currency the
 * operator sells. */
export interface IBillingCharge {
  label: string;
  amount: string;
  currency: string;
  paymentMethods: string[];
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
  charges: IBillingCharge[];
  subscription: IBillingSubscription | null;
}

export interface IStartCheckoutRequest {
  cadence?: BillingCadence;
  charge?: {
    amount: string;
    currency: string;
    paymentMethods?: string[];
  };
}

export interface IStartCheckoutResponse {
  checkoutUrl: string;
}
