import { afterAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { schema } from "@heptadec/db";
import { config } from "../src/common/config/env";
import { authFor } from "../src/common/config/better-auth";
import { db, request, signUp, uniqueEmail, uniqueSlug } from "./helpers";

const { billingPayment } = schema;

const PAYMENT_EVENTS = [
  "checkout.completed",
  "payment.completed",
  "collection.succeeded",
] as const;

interface IPaymentEventInput {
  type?: string;
  createdAt?: string;
  organizationId: string;
  checkoutId?: string;
  customerId?: string;
  amount?: string;
  currency?: string;
  status?: string;
}

function paymentEventBody(input: IPaymentEventInput): string {
  return JSON.stringify({
    id: "evt_test",
    type: input.type ?? "checkout.completed",
    created_at: input.createdAt ?? "2026-10-17T10:00:00.000000+00:00",
    organization_id: input.organizationId,
    data: {
      checkout_id: input.checkoutId ?? "chk_test",
      customer: { customer_id: input.customerId ?? "cust_test" },
      amount: input.amount ?? "5000.00",
      currency: input.currency ?? "USD",
      status: input.status ?? "completed",
      metadata: { organization_id: input.organizationId },
    },
  });
}

async function deliver(body: string): Promise<Response> {
  return request("/api/webhooks/bachs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bachs-signature-v2": await signedHeader(body),
    },
    body,
  });
}

/** The signature the webhook accepts: HMAC of `${seconds}.${raw}` under the
 * configured secret, mirroring billing.test.ts's own signer. */
async function signedHeader(raw: string): Promise<string> {
  const seconds = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(config.bachs.webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${seconds}.${raw}`)),
  );
  const hex = Array.from(digest)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `t=${seconds},v1=${hex}`;
}

beforeEach(() => {
  // The checkout initiation goes to the configured Bachs host; the test
  // stubs a canned session instead of the network.
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify({ checkout_url: "https://checkout.test/session/chk_stub" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await db
    .delete(billingPayment)
    .where(like(billingPayment.organizationId, "org-payment-%"));
});

async function storedPayment(organizationId: string) {
  const rows = await db
    .select()
    .from(billingPayment)
    .where(eq(billingPayment.organizationId, organizationId));
  return rows[0];
}

describe("payment webhook storage", () => {
  beforeEach(async () => {
    await db.delete(billingPayment);
  });

  it.each(PAYMENT_EVENTS)("stores a billing_payment row for %s", async (type) => {
    const organizationId = "org-payment-" + type;
    const response = await deliver(paymentEventBody({ organizationId, type }));
    expect(response.status).toBe(200);

    const row = await storedPayment(organizationId);
    expect(row).not.toBeUndefined();
    expect(row!.checkoutId).toBe("chk_test");
    expect(row!.amount).toBe("5000.00");
    expect(row!.currency).toBe("USD");
    expect(row!.status).toBe("completed");
  });
});

describe("charge initiation route", () => {
  async function signedInOwner() {
    const { cookie } = await signUp(uniqueEmail());
    const created = await authFor(db).api.createOrganization({
      body: { name: "Charge Test", slug: uniqueSlug() },
      headers: { cookie },
    });
    return { cookie, organizationId: created.id };
  }

  it("starts a one-time charge in the given currency", async () => {
    const { cookie, organizationId } = await signedInOwner();

    const response = await request("/api/billing/checkout", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        charge: { amount: "5000.00", currency: "USD", paymentMethods: ["USD_CARD"] },
      }),
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { checkoutUrl: string };
    expect(typeof body.checkoutUrl).toBe("string");
    expect(body.checkoutUrl).toContain("https://");
  });

  it("starts a charge in another currency", async () => {
    const { cookie, organizationId } = await signedInOwner();

    const response = await request("/api/billing/checkout", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        charge: { amount: "50000.00", currency: "NGN", paymentMethods: ["NGN_BANK_TRANSFER"] },
      }),
    });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { checkoutUrl: string };
    expect(body.checkoutUrl).toContain("https://");
  });

  it("refuses a viewer", async () => {
    const { organizationId } = await signedInOwner();
    const { user: viewer, cookie: viewerCookie } = await signUp(uniqueEmail());
    await authFor(db).api.addMember({
      body: { userId: viewer.id, role: "viewer", organizationId },
    });

    const response = await request("/api/billing/checkout", {
      method: "POST",
      headers: { cookie: viewerCookie, "content-type": "application/json" },
      body: JSON.stringify({
        charge: { amount: "5000.00", currency: "USD" },
      }),
    });
    expect(response.status).toBe(403);
  });
});