import { BadRequestException } from "../../common/exceptions";

/**
 * One reader for a Bachs delivery. Subscription and payment events are two
 * kind sets over the same envelope; the field readers below are that
 * envelope's vocabulary, and this file is their only home. A delivery whose
 * type this deployment does not handle reads as null, and other malformed
 * deliveries are refused with the path that went missing, because the
 * at-least-once stream must fail loudly rather than be guessed.
 */

export const SUBSCRIPTION_EVENT_TYPES = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
] as const;

export type SubscriptionEventType = (typeof SUBSCRIPTION_EVENT_TYPES)[number];

export interface ISubscriptionEvent {
  occurredAt: Date;
  organizationId: string;
  subscriptionId: string;
  customerId: string;
  productId: string;
  status: string;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export function readSubscriptionEvent(raw: string): ISubscriptionEvent | null {
  const event = record(JSON.parse(raw), "the delivery");
  if (!isSubscriptionEventType(event.type)) {
    return null;
  }
  const data = record(event.data, "data");
  const customer = record(data.customer, "data.customer");
  const metadata = record(data.metadata, "data.metadata");
  return {
    occurredAt: moment(event.created_at, "created_at"),
    organizationId: text(metadata.organization_id, "data.metadata.organization_id"),
    subscriptionId: text(data.subscription_id, "data.subscription_id"),
    customerId: text(customer.customer_id, "data.customer.customer_id"),
    productId: text(data.product_id, "data.product_id"),
    status: text(data.status, "data.status"),
    currentPeriodEnd: optionalMoment(
      data.current_period_end,
      "data.current_period_end",
    ),
    cancelAtPeriodEnd: flag(data.cancel_at_period_end, "data.cancel_at_period_end"),
  };
}

export function isSubscriptionEventType(
  value: unknown,
): value is SubscriptionEventType {
  return isEventType(value, SUBSCRIPTION_EVENT_TYPES);
}

export const PAYMENT_EVENT_TYPES = [
  "checkout.completed",
  "payment.completed",
  "collection.succeeded",
] as const;

export type PaymentEventType = (typeof PAYMENT_EVENT_TYPES)[number];

export interface IPaymentEvent {
  occurredAt: Date;
  organizationId: string;
  checkoutId: string;
  customerId: string;
  amount: string;
  currency: string;
  status: string;
}

export function readPaymentEvent(raw: string): IPaymentEvent | null {
  const event = record(JSON.parse(raw), "the delivery");
  if (!isPaymentEventType(event.type)) {
    return null;
  }
  const data = record(event.data, "data");
  const customer = record(data.customer, "data.customer");
  const metadata = record(data.metadata, "data.metadata");
  return {
    occurredAt: moment(event.created_at, "created_at"),
    organizationId: text(metadata.organization_id, "data.metadata.organization_id"),
    checkoutId: text(data.checkout_id, "data.checkout_id"),
    customerId: text(customer.customer_id, "data.customer.customer_id"),
    amount: text(data.amount, "data.amount"),
    currency: text(data.currency, "data.currency"),
    status: text(data.status, "data.status"),
  };
}

export function isPaymentEventType(value: unknown): value is PaymentEventType {
  return isEventType(value, PAYMENT_EVENT_TYPES);
}

function isEventType<K extends string>(
  value: unknown,
  types: readonly K[],
): value is K {
  return (
    typeof value === "string" &&
    (types as readonly string[]).includes(value)
  );
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException(`The delivery has no ${path}`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value === "") {
    throw new BadRequestException(`The delivery has no ${path}`);
  }
  return value;
}

function moment(value: unknown, path: string): Date {
  const parsed = optionalMoment(value, path);
  if (parsed === null) {
    throw new BadRequestException(`The delivery has no ${path}`);
  }
  return parsed;
}

function optionalMoment(value: unknown, path: string): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = new Date(text(value, path));
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`The delivery has a malformed ${path}`);
  }
  return parsed;
}

function flag(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestException(`The delivery has no ${path}`);
  }
  return value;
}
