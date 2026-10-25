import { config } from "../../common/config/env";
import {
  BILLING_CADENCES,
  type BillingCadence,
  type IBillingPlan,
  type IBillingCharge,
} from "./contracts";

const PLAN_COPY: Record<BillingCadence, { label: string; note: string }> = {
  monthly: { label: "Monthly", note: "Billed every month" },
  yearly: { label: "Yearly", note: "Billed every year, two months free" },
};

/**
 * Conversion rates (USD to other currencies).
 * These are approximate rates - for production, use a real exchange rate API.
 * Rates as of a specific date - update as needed.
 */
const CURRENCY_RATES: Record<string, number> = {
  // Major currencies - approximate rates
  USD: 1,
  NGN: 900, // Nigerian Naira
  EUR: 0.91,
  GBP: 0.78,
  CAD: 1.37,
  AUD: 1.51,
  INR: 83,
  MXN: 17,
  BRL: 5.3,
  JPY: 151,
};

/**
 * Convert a USD amount to the target currency.
 * @param amountUsd The amount in USD (as string)
 * @param targetCurrency The target currency code (e.g., "NGN", "EUR")
 * @returns The amount converted to the target currency (as string)
 */
function convertAmountFromUsd(
  amountUsd: string,
  targetCurrency: string,
): string {
  const rate = CURRENCY_RATES[targetCurrency] ?? 1;
  const amount = parseFloat(amountUsd);
  const converted = amount * rate;
  // Format based on currency precision
  if (targetCurrency === "JPY") {
    // JPY has no minor units
    return Math.round(converted).toString();
  }
  if (targetCurrency === "NGN") {
    // NGN typically uses 2 decimal places
    return converted.toFixed(2);
  }
  // Default: 2 decimal places
  return converted.toFixed(2);
}

/**
 * Get the display amount and currency for a billing plan.
 * The underlying Bachs charge is always in USD, but the display can show
 * the price in the target currency for UI purposes.
 *
 * @param cadence The billing cadence (monthly/yearly)
 * @param targetCurrency The currency to display in (defaults to configured currency)
 * @returns IBillingPlan with the display amount and currency
 */
export function billingPlans(
  targetCurrency?: string,
): IBillingPlan[] {
  return BILLING_CADENCES.map((cadence) => {
    const usdAmount = config.bachs.prices[cadence];
    const displayCurrency = targetCurrency || config.bachs.currency;
    const displayAmount = convertAmountFromUsd(usdAmount, displayCurrency);

    return {
      cadence,
      label: PLAN_COPY[cadence].label,
      amount: displayAmount,
      currency: displayCurrency,
      note: PLAN_COPY[cadence].note,
    };
  });
}

/**
 * Create a one-time charge with pricing in the specified currency.
 * The charge amount is converted from USD to the target currency for display,
 * but the underlying Bachs checkout still charges in USD.
 *
 * @param amountUsd The amount in USD (e.g., "5.00")
 * @param currency The target currency code (e.g., "NGN", "USD")
 * @returns IBillingCharge with the display amount and currency
 */
export function createDisplayCharge(
  amountUsd: string,
  currency: string,
): IBillingCharge {
  const displayAmount = convertAmountFromUsd(amountUsd, currency);
  return {
    label: `${currency} ${displayAmount}`,
    amount: displayAmount,
    currency,
    paymentMethods: [],
  };
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
