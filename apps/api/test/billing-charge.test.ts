import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { checkBillingRenewals } from "../src/modules/billing/renewal";
import { db, request, signUp, uniqueEmail, uniqueSlug } from "./helpers";

const { billingCustomer, billingPayment, organization } = schema;

const DAY_MS = 24 * 60 * 60 * 1000;

interface ISent {
  path: string;
  body: Record<string, unknown>;
  idempotencyKey: string | null;
}

let sent: ISent[] = [];

function stubBachs(replies: Record<string, Record<string, unknown>>): void {
  sent = [];
  vi.stubGlobal(
    "fetch",
    async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const path = new URL(url).pathname;
      sent.push({
        path,
        body: JSON.parse(
          typeof init?.body === "string" ? init.body : "{}",
        ) as Record<string, unknown>,
        idempotencyKey: new Headers(init?.headers).get("idempotency-key"),
      });
      const reply = replies[path];
      if (reply === undefined) {
        throw new Error(`unexpected Bachs call: ${path}`);
      }
      return new Response(JSON.stringify(reply), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await db.delete(billingPayment);
  await db.delete(billingCustomer);
});

async function customerOf(
  database: HeptadecDatabase,
  organizationId: string,
) {
  const rows = await database
    .select()
    .from(billingCustomer)
    .where(eq(billingCustomer.organizationId, organizationId));
  return rows[0];
}

async function signedInOwner(): Promise<{
  cookie: string;
  organizationId: string;
}> {
  const { cookie } = await signUp(uniqueEmail());
  const created = await authFor(db).api.createOrganization({
    body: { name: "Charge Test", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, organizationId: created.id };
}

async function organizationInTrial(
  createdDaysAgo = 0,
): Promise<string> {
  const inserted = await db
    .insert(organization)
    .values({
      name: "Renewal Org",
      slug: uniqueSlug(),
      createdAt: new Date(Date.now() - createdDaysAgo * DAY_MS),
    })
    .returning({ id: organization.id });
  return inserted[0]!.id;
}

describe("starting a checkout", () => {
  it("creates the Bachs customer once, prices the plan in USD, and saves the card", async () => {
    stubBachs({
      "/v1/customers": { customer_id: "cust_new" },
      "/v1/checkout-sessions": {
        checkout_url: "https://checkout.test/session/chk_new",
      },
    });
    const { cookie, organizationId } = await signedInOwner();

    const response = await request("/api/billing/checkout", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ cadence: "monthly" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { checkoutUrl: string };
    expect(body.checkoutUrl).toBe("https://checkout.test/session/chk_new");

    const customer = await customerOf(db, organizationId);
    expect(customer?.customerId).toBe("cust_new");
    expect(customer?.autoRenew).toBe(false);

    const checkout = sent.find((call) => call.path === "/v1/checkout-sessions");
    expect(checkout).toBeDefined();
    expect(checkout?.body.pricing).toEqual({ currency: "USD", amount: "5.00" });
    expect(checkout?.body.save_payment_method).toBe(true);
    expect(checkout?.body.customer).toEqual({ customer_id: "cust_new" });
    expect(checkout?.body.metadata).toEqual({
      organization_id: organizationId,
      cadence: "monthly",
    });
  });

  it("prices the yearly plan in USD and reuses the stored customer", async () => {
    stubBachs({
      "/v1/customers": { customer_id: "cust_reused" },
      "/v1/checkout-sessions": {
        checkout_url: "https://checkout.test/session/chk_yearly",
      },
    });
    const { cookie, organizationId } = await signedInOwner();
    const checkoutWith = (cadence: string) =>
      request("/api/billing/checkout", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ cadence }),
      });

    expect((await checkoutWith("monthly")).status).toBe(200);
    expect((await checkoutWith("yearly")).status).toBe(200);

    expect(sent.filter((call) => call.path === "/v1/customers")).toHaveLength(1);
    const prices = sent
      .filter((call) => call.path === "/v1/checkout-sessions")
      .map((call) => call.body.pricing);
    expect(prices).toEqual([
      { currency: "USD", amount: "5.00" },
      { currency: "USD", amount: "50.00" },
    ]);
    const rows = await db
      .select()
      .from(billingCustomer)
      .where(eq(billingCustomer.organizationId, organizationId));
    expect(rows).toHaveLength(1);
  });

  it("refuses a viewer and writes no customer", async () => {
    stubBachs({
      "/v1/customers": { customer_id: "cust_viewer" },
      "/v1/checkout-sessions": {
        checkout_url: "https://checkout.test/session/chk_viewer",
      },
    });
    const { organizationId } = await signedInOwner();
    const { user: viewer, cookie: viewerCookie } = await signUp(uniqueEmail());
    await authFor(db).api.addMember({
      body: { userId: viewer.id, role: "viewer", organizationId },
    });
    await request("/api/organization/switch", {
      method: "POST",
      headers: { cookie: viewerCookie, "content-type": "application/json" },
      body: JSON.stringify({ organizationId }),
    });

    const response = await request("/api/billing/checkout", {
      method: "POST",
      headers: { cookie: viewerCookie, "content-type": "application/json" },
      body: JSON.stringify({ cadence: "monthly" }),
    });
    expect(response.status).toBe(403);
    expect(sent).toHaveLength(0);
    expect(await customerOf(db, organizationId)).toBeUndefined();
  });
});

describe("charging the saved card for the next period", () => {
  async function lapsedWithCard(cadence: "monthly" | "yearly" = "monthly") {
    const organizationId = await organizationInTrial(40);
    const now = new Date();
    const paymentId = `pay_${organizationId}`;
    await db.insert(billingPayment).values({
      id: paymentId,
      organizationId,
      customerId: `cust_${organizationId}`,
      checkoutId: `chk_${organizationId}`,
      cadence,
      amount: cadence === "yearly" ? "50.00" : "5.00",
      currency: "USD",
      status: "paid",
      periodEndsAt: new Date(now.getTime() - DAY_MS),
      createdAt: new Date(now.getTime() - 31 * DAY_MS),
    });
    const inserted = await db
      .insert(billingCustomer)
      .values({
        organizationId,
        customerId: `cust_${organizationId}`,
        paymentMethodId: `pm_${organizationId}`,
        autoRenew: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: billingCustomer.id });
    return {
      organizationId,
      customerId: inserted[0]!.id,
      paymentId,
      cardId: `pm_${organizationId}`,
    };
  }

  it("charges the plan's USD price once and remembers the charge in flight", async () => {
    const { organizationId, customerId, paymentId, cardId } =
      await lapsedWithCard("yearly");
    stubBachs({
      "/v1/charges": { payment_id: "chg_renewed", status: "pending" },
    });

    const submitted = await checkBillingRenewals(db, new Date());
    expect(submitted).toBe(1);

    const charge = sent.find((call) => call.path === "/v1/charges");
    expect(charge).toBeDefined();
    expect(charge?.body.amount).toBe("50.00");
    expect(charge?.body.currency).toBe("USD");
    expect(charge?.body.customer).toBe(`cust_${organizationId}`);
    expect(charge?.body.payment_method).toBe(cardId);
    expect(charge?.body.reference).toBe(`renewal-${organizationId}-${paymentId}`);
    expect(charge?.idempotencyKey).toBe(`renewal-${organizationId}-${paymentId}`);

    const stored = await db
      .select()
      .from(billingCustomer)
      .where(eq(billingCustomer.id, customerId));
    expect(stored[0]?.pendingChargeId).toBe("chg_renewed");
    expect(stored[0]?.autoRenew).toBe(true);
  });

  it("does not start a second charge while one is in flight", async () => {
    const { customerId } = await lapsedWithCard();
    await db
      .update(billingCustomer)
      .set({ pendingChargeId: "chg_in_flight" })
      .where(eq(billingCustomer.id, customerId));
    stubBachs({
      "/v1/charges": { payment_id: "chg_second", status: "pending" },
    });

    const submitted = await checkBillingRenewals(db, new Date());
    expect(submitted).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("asks again for the same charge when its webhook never arrived", async () => {
    const { organizationId, customerId, paymentId } = await lapsedWithCard();
    const stale = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await db
      .update(billingCustomer)
      .set({ pendingChargeId: "chg_lost", updatedAt: stale })
      .where(eq(billingCustomer.id, customerId));
    stubBachs({
      "/v1/charges": { payment_id: "chg_lost", status: "pending" },
    });

    const submitted = await checkBillingRenewals(db, new Date());
    expect(submitted).toBe(1);

    const reference = `renewal-${organizationId}-${paymentId}`;
    const charge = sent.find((call) => call.path === "/v1/charges");
    expect(charge?.body.reference).toBe(reference);
    expect(charge?.idempotencyKey).toBe(reference);

    const stored = await db
      .select()
      .from(billingCustomer)
      .where(eq(billingCustomer.id, customerId));
    expect(stored[0]?.pendingChargeId).toBe("chg_lost");
  });

  it("stops renewing when Bachs refuses the charge outright", async () => {
    const { customerId } = await lapsedWithCard();
    stubBachs({
      "/v1/charges": { payment_id: "chg_refused", status: "failed" },
    });

    const submitted = await checkBillingRenewals(db, new Date());
    expect(submitted).toBe(0);

    const stored = await db
      .select()
      .from(billingCustomer)
      .where(eq(billingCustomer.id, customerId));
    expect(stored[0]?.autoRenew).toBe(false);
    expect(stored[0]?.pendingChargeId).toBeNull();
  });

  it("leaves a customer whose trial is still running alone", async () => {
    const organizationId = await organizationInTrial();
    await db.insert(billingCustomer).values({
      organizationId,
      customerId: `cust_${organizationId}`,
      paymentMethodId: `pm_${organizationId}`,
      autoRenew: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    stubBachs({
      "/v1/charges": { payment_id: "chg_unexpected", status: "pending" },
    });

    const submitted = await checkBillingRenewals(db, new Date());
    expect(submitted).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it("leaves a customer that stopped renewing alone", async () => {
    const { customerId } = await lapsedWithCard();
    await db
      .update(billingCustomer)
      .set({ autoRenew: false })
      .where(eq(billingCustomer.id, customerId));
    stubBachs({
      "/v1/charges": { payment_id: "chg_unexpected", status: "pending" },
    });

    const submitted = await checkBillingRenewals(db, new Date());
    expect(submitted).toBe(0);
    expect(sent).toHaveLength(0);
  });
});
