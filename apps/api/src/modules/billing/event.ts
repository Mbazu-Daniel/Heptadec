import { BadRequestException } from "../../common/exceptions";

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
  return (
    typeof value === "string" &&
    (SUBSCRIPTION_EVENT_TYPES as readonly string[]).includes(value)
  );
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException(`The Bachs delivery has no ${path}`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value === "") {
    throw new BadRequestException(`The Bachs delivery has no ${path}`);
  }
  return value;
}

function moment(value: unknown, path: string): Date {
  const parsed = optionalMoment(value, path);
  if (parsed === null) {
    throw new BadRequestException(`The Bachs delivery has no ${path}`);
  }
  return parsed;
}

function optionalMoment(value: unknown, path: string): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = new Date(text(value, path));
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`The Bachs delivery has a malformed ${path}`);
  }
  return parsed;
}

function flag(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestException(`The Bachs delivery has no ${path}`);
  }
  return value;
}
