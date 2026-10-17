import { config } from "../../common/config/env";
import { BadGatewayException } from "../../common/exceptions";

const REQUEST_TIMEOUT_MS = 10_000;

export interface ICheckoutRequest {
  productId: string;
  email: string;
  name: string;
  organizationId: string;
}

interface ICheckoutSession {
  checkout_url: string;
}

/**
 * A Bachs checkout session for a recurring product. The card is saved here and
 * every renewal is Bachs's to collect, so what comes back is a URL to send the
 * customer to and nothing else.
 */
export async function createCheckoutSession(
  request: ICheckoutRequest,
): Promise<string> {
  const response = await fetch(`${config.bachs.baseUrl}/v1/checkout-sessions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.bachs.secretKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      product_cart: [{ product_id: request.productId, quantity: 1 }],
      customer: { email: request.email, name: request.name },
      metadata: { organization_id: request.organizationId },
      ...returnUrls(),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new BadGatewayException(
      `Bachs refused the checkout (${response.status})`,
    );
  }
  const session = (await response.json()) as ICheckoutSession;
  return session.checkout_url;
}

/**
 * Where Bachs sends the customer back to. `/app` is the route that hands a
 * signed-in person their dashboard, so a finished checkout lands in the product
 * rather than on the marketing page.
 *
 * Bachs refuses localhost and private addresses, so a deployment reached on one
 * is left with no return URL at all: the customer pays and comes back by hand,
 * which is Bachs's own advice for a local checkout.
 */
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
