import { config } from "../../common/config/env";
import { BadGatewayException } from "../../common/exceptions";

const REQUEST_TIMEOUT_MS = 10_000;

export interface ICheckoutRequest {
  productId?: string;
  pricing?: { currency: string; amount: string };
  paymentMethodTypes?: string[];
  email: string;
  name: string;
  organizationId: string;
}

interface ICheckoutSession {
  checkout_url: string;
}

export async function createCheckoutSession(
  request: ICheckoutRequest,
): Promise<string> {
  const body: Record<string, unknown> = {
    customer: { email: request.email, name: request.name },
    metadata: { organization_id: request.organizationId },
    ...returnUrls(),
  };
  if (request.productId) {
    body.product_cart = [{ product_id: request.productId, quantity: 1 }];
  }
  if (request.pricing) {
    body.pricing = request.pricing;
  }
  if (request.paymentMethodTypes) {
    body.payment_method_types = request.paymentMethodTypes;
  }

  const response = await fetch(`${config.bachs.baseUrl}/v1/checkout-sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.bachs.secretKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new BadGatewayException(
      `The checkout was refused (${response.status})`,
    );
  }
  const session = (await response.json()) as ICheckoutSession;
  return session.checkout_url;
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
