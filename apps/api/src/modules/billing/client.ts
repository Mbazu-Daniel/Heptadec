import { config } from "../../common/config/env";
import { BadGatewayException } from "../../common/exceptions";
import { BILLING_CURRENCY } from "./catalog";

const REQUEST_TIMEOUT_MS = 10_000;

export async function createCustomer(request: {
  email: string;
  name: string;
  organizationId: string;
}): Promise<string> {
  const created = await post("/v1/customers", {
    email: request.email,
    name: request.name,
    metadata: { organization_id: request.organizationId },
  });
  const customerId = created.customer_id;
  if (typeof customerId !== "string" || customerId === "") {
    throw new BadGatewayException("Bachs created no customer");
  }
  return customerId;
}

export async function createCheckoutSession(request: {
  customerId: string;
  amount: string;
  metadata: Record<string, string>;
}): Promise<string> {
  const body: Record<string, unknown> = {
    customer: { customer_id: request.customerId },
    pricing: { currency: BILLING_CURRENCY, amount: request.amount },
    save_payment_method: true,
    metadata: request.metadata,
    ...returnUrls(),
  };

  const session = await post("/v1/checkout-sessions", body);
  const checkoutUrl = session.checkout_url;
  if (typeof checkoutUrl !== "string" || checkoutUrl === "") {
    throw new BadGatewayException("Bachs opened no checkout");
  }
  return checkoutUrl;
}

export async function createRenewalCharge(request: {
  customerId: string;
  paymentMethodId: string;
  amount: string;
  reference: string;
  metadata: Record<string, string>;
}): Promise<{ chargeId: string; status: string }> {
  const charge = await post(
    "/v1/charges",
    {
      customer: request.customerId,
      payment_method: request.paymentMethodId,
      amount: request.amount,
      currency: BILLING_CURRENCY,
      description: "Heptadec renewal",
      reference: request.reference,
      metadata: request.metadata,
    },
    request.reference,
  );
  const chargeId = charge.payment_id;
  if (typeof chargeId !== "string" || chargeId === "") {
    throw new BadGatewayException("Bachs started no charge");
  }
  const status = charge.status;
  if (typeof status !== "string" || status === "") {
    throw new BadGatewayException("Bachs reported no charge status");
  }
  return { chargeId, status };
}

async function post(
  path: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${config.bachs.secretKey}`,
    "content-type": "application/json",
  };
  if (idempotencyKey !== undefined) {
    headers["idempotency-key"] = idempotencyKey;
  }

  const response = await fetch(`${config.bachs.baseUrl}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new BadGatewayException(`Bachs refused the request (${response.status})`);
  }
  return (await response.json()) as Record<string, unknown>;
}

function returnUrls(): { success_url?: string; cancel_url?: string } {
  const host = new URL(config.webUrl).hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return {};
  }
  return {
    success_url: `${config.webUrl}/app`,
    cancel_url: `${config.webUrl}/app`,
  };
}
