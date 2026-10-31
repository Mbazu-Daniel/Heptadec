import { BadRequestException } from "../../common/exceptions";
import { isJsonObject } from "../../common/http/body";
import { type BillingCadence, isBillingCadence } from "./contracts";

export type BillingEvent = IPaidEvent | IFailedEvent | ICardSavedEvent;

export interface IPaidEvent {
  kind: "paid";
  occurredAt: Date;
  organizationId: string | null;
  cadence: BillingCadence | null;
  checkoutId: string | null;
  chargeId: string | null;
  customerId: string | null;
  amount: string;
  currency: string;
  status: string;
}

export interface IFailedEvent {
  kind: "failed";
  occurredAt: Date;
  organizationId: string | null;
  checkoutId: string | null;
  chargeId: string | null;
  customerId: string | null;
}

export interface ICardSavedEvent {
  kind: "card";
  occurredAt: Date;
  customerId: string;
  paymentMethodId: string;
  cardBrand: string | null;
  cardLast4: string | null;
}

export const PAID_STATUSES = ["SUCCEEDED", "ACCEPTED", "OVERPAID"] as const;

export function readBillingEvent(raw: string): BillingEvent | null {
  const event = record(JSON.parse(raw), "the delivery");
  const occurredAt = moment(event.created_at, "created_at");

  switch (text(event.type, "type")) {
    case "checkout.completed":
      return readCheckoutCompleted(event, occurredAt);
    case "collection.succeeded":
      return readCollection(event, occurredAt, "paid");
    case "collection.failed":
      return readCollection(event, occurredAt, "failed");
    case "payment_method.saved":
      return readCardSaved(event, occurredAt);
    default:
      return null;
  }
}

function readCheckoutCompleted(
  event: Record<string, unknown>,
  occurredAt: Date,
): IPaidEvent | null {
  const data = record(event.data, "data");
  if (text(data.payment_status, "data.payment_status") !== "paid") {
    return null;
  }
  const charge = optionalRecord(data.charge);
  const metadata = optionalRecord(data.metadata);
  const customer = optionalRecord(data.customer);
  return {
    kind: "paid",
    occurredAt,
    ...fromMetadata(metadata),
    checkoutId: text(data.checkout_id, "data.checkout_id"),
    chargeId: charge === null ? null : optionalText(charge.id),
    customerId: customer === null ? null : optionalText(customer.customer_id),
    amount: text(data.amount, "data.amount"),
    currency: text(data.currency, "data.currency"),
    status: "paid",
  };
}

function readCollection(
  event: Record<string, unknown>,
  occurredAt: Date,
  kind: "paid" | "failed",
): IPaidEvent | IFailedEvent | null {
  const data = record(event.data, "data");
  const status = text(data.status, "data.status");
  if (kind === "paid" && !PAID_STATUSES.some((paid) => paid === status)) {
    return null;
  }
  const customer = optionalRecord(data.customer);
  const common = {
    occurredAt,
    ...fromMetadata(optionalRecord(data.metadata)),
    checkoutId: optionalText(data.checkout_id),
    chargeId: optionalText(data.charge_id),
    customerId: customer === null ? null : optionalText(customer.id),
  };
  if (kind === "failed") {
    return { kind: "failed", ...common };
  }
  return {
    kind: "paid",
    ...common,
    amount: text(data.amount, "data.amount"),
    currency: text(data.currency, "data.currency"),
    status,
  };
}

function readCardSaved(
  event: Record<string, unknown>,
  occurredAt: Date,
): ICardSavedEvent {
  const data = record(event.data, "data");
  const customer = record(data.customer, "data.customer");
  return {
    kind: "card",
    occurredAt,
    customerId: text(customer.customer_id, "data.customer.customer_id"),
    paymentMethodId: text(data.payment_method_id, "data.payment_method_id"),
    cardBrand: optionalText(data.card_brand),
    cardLast4: optionalText(data.card_last4),
  };
}

function fromMetadata(metadata: Record<string, unknown> | null): {
  organizationId: string | null;
  cadence: BillingCadence | null;
} {
  if (metadata === null) {
    return { organizationId: null, cadence: null };
  }
  const cadence = optionalText(metadata.cadence);
  if (cadence === null) {
    return { organizationId: optionalText(metadata.organization_id), cadence: null };
  }
  if (!isBillingCadence(cadence)) {
    throw new BadRequestException("The delivery has an unknown plan");
  }
  return { organizationId: optionalText(metadata.organization_id), cadence };
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isJsonObject(value)) {
    throw new BadRequestException(`The delivery has no ${path}`);
  }
  return value;
}

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return isJsonObject(value) ? value : null;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || value === "") {
    throw new BadRequestException(`The delivery has no ${path}`);
  }
  return value;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function moment(value: unknown, path: string): Date {
  const parsed = new Date(text(value, path));
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`The delivery has a malformed ${path}`);
  }
  return parsed;
}
