import type { BillingCadence } from "./contracts";

export interface IBillingSummaryInput {
  userId: string;
}

export interface IStartCheckoutInput {
  email: string;
  name: string;
  cadence: BillingCadence;
}

export interface ISetAutoRenewInput {
  enabled: boolean;
}

export interface IBillingWebhookInput {
  signature: string | null;
  raw: string;
}
