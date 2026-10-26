import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import { config } from "../src/common/config/env";
import { authFor } from "../src/common/config/better-auth";
import { db, request, signUp, uniqueEmail, uniqueSlug } from "./helpers";

const { billingCustomer, billingPayment } = schema;

const DAY_MS = 24 * 60 * 60 * 1000;
const WEBHOOK_SECRET = config.bachs.webhookSecret;

interface IEventInput {
  type?: string;
  createdAt?: string;
  organizationId: string;
  cadence?: string;
  checkoutId?: string | null;
  chargeId?: string;
  customerId?: string;
  status?: string;
  amount?: string;
  currency?: string;
  paymentStatus?: string;
  paymentMethodId?: string;
  cardLast4?: string;
}

function eventBody(input: IEventInput): string {
  const metadata = {
    organization_id: input.organizationId,
    cadence: input.cadence ?? "monthly",
  };
  const customer = { customer_id: input.customerId ?? "cust_test" };

  if (input.type === "payment_method.saved") {
    return JSON.stringify({
      id: "evt_test",
      type: input.type,
      created_at: input.createdAt ?? new Date().toISOString(),
      organization_id: "acct_test",
      data: {
        customer,
        payment_method_id: input.paymentMethodId ?? "pm_test",
        card_brand: "visa",
        card_last4: input.cardLast4 ?? "4242",
      },
    });
  }

  const checkoutCompleted =
    input.type === "checkout.completed" || input.type === undefined;

  return JSON.stringify({
    id: "evt_test",
    type: input.type ?? "checkout.completed",
    created_at: input.createdAt ?? new Date().toISOString(),
    organization_id: "acct_test",
    data: {
      checkout_id: input.checkoutId === undefined ? "chk_test" : input.checkoutId,
      charge_id: input.chargeId ?? "chg_test",
      customer: checkoutCompleted
        ? { customer_id: input.customerId ?? "cust_test" }
        : { id: input.customerId ?? "cust_test" },
      charge: { id: input.chargeId ?? "chg_test" },
      amount: input.amount ?? "5.00",
      currency: input.currency ?? "USD",
      payment_status: input.paymentStatus ?? "paid",
      status: input.status ?? "SUCCEEDED",
      metadata,
    },
  });
}

async function signature(raw: string, seconds: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(`${seconds}.${raw}`),
    ),
  );
  const hex = [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `t=${seconds},v1=${hex}`;
}

async function deliver(body: string): Promise<Response> {
  const seconds = Math.floor(Date.now() / 1000);
  return request("/api/webhooks/bachs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bachs-signature-v2": await signature(body, seconds),
    },
    body,
  });
}

async function paymentsOf(
  database: HeptadecDatabase,
  organizationId: string,
) {
  return database
    .select()
    .from(billingPayment)
    .where(eq(billingPayment.organizationId, organizationId));
}

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
    body: { name: "Billing Test", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, organizationId: created.id };
}

beforeEach(async () => {
  await db.delete(billingPayment);
  await db.delete(billingCustomer);
});

describe("what a delivery writes", () => {
  it("stores one payment and the period a paid checkout bought", async () => {
    const organizationId = "org-webhook-checkout";
    const before = Date.now();

    const response = await deliver(
      eventBody({
        organizationId,
        checkoutId: "chk_monthly",
        chargeId: "chg_monthly",
        amount: "5.00",
      }),
    );
    expect(response.status).toBe(200);

    const rows = await paymentsOf(db, organizationId);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.checkoutId).toBe("chk_monthly");
    expect(row.chargeId).toBe("chg_monthly");
    expect(row.cadence).toBe("monthly");
    expect(row.amount).toBe("5.00");
    expect(row.currency).toBe("USD");
    expect(row.customerId).toBe("cust_test");
    expect(row.periodEndsAt).not.toBeNull();
    const period = row.periodEndsAt!.getTime();
    expect(period).toBeGreaterThan(before + 30 * DAY_MS - 1000);
    expect(period).toBeLessThan(before + 30 * DAY_MS + 1000);
  });

  it("promises auto-renew only once a card is saved", async () => {
    const organizationId = "org-webhook-paid-no-card";
    await db.insert(billingCustomer).values({
      organizationId,
      customerId: "cust_test",
      autoRenew: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await deliver(
      eventBody({ organizationId, checkoutId: "chk_no_card", chargeId: "chg_no_card" }),
    );

    const afterPayment = await customerOf(db, organizationId);
    expect(afterPayment?.autoRenew).toBe(false);

    await deliver(
      eventBody({
        organizationId,
        type: "payment_method.saved",
        customerId: "cust_test",
        paymentMethodId: "pm_visa",
        cardLast4: "1881",
      }),
    );

    const afterCard = await customerOf(db, organizationId);
    expect(afterCard?.autoRenew).toBe(true);
    expect(afterCard?.paymentMethodId).toBe("pm_visa");
  });

  it("stores no payment when the checkout has not been paid", async () => {
    const organizationId = "org-webhook-unpaid";

    const response = await deliver(
      eventBody({ organizationId, checkoutId: "chk_unpaid", paymentStatus: "pending" }),
    );
    expect(response.status).toBe(200);
    expect(await paymentsOf(db, organizationId)).toHaveLength(0);
  });

  it("stores one row for the same payment seen through both deliveries", async () => {
    const organizationId = "org-webhook-twice";

    await deliver(
      eventBody({ organizationId, checkoutId: "chk_twice", chargeId: "chg_twice" }),
    );
    const again = await deliver(
      eventBody({
        organizationId,
        type: "collection.succeeded",
        checkoutId: "chk_twice",
        chargeId: "chg_twice",
        status: "SUCCEEDED",
      }),
    );
    expect(again.status).toBe(200);

    const rows = await paymentsOf(db, organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.checkoutId).toBe("chk_twice");
  });

  it("extends from the period still running when a renewal charge clears", async () => {
    const organizationId = "org-webhook-renewal";
    const runningUntil = new Date(Date.now() + 3 * DAY_MS);
    await db.insert(billingPayment).values({
      organizationId,
      customerId: "cust_test",
      checkoutId: "chk_first",
      cadence: "monthly",
      amount: "5.00",
      currency: "USD",
      status: "paid",
      periodEndsAt: runningUntil,
      createdAt: new Date(),
    });

    const response = await deliver(
      eventBody({
        organizationId,
        type: "collection.succeeded",
        checkoutId: null,
        chargeId: "chg_renewal",
        status: "SUCCEEDED",
      }),
    );
    expect(response.status).toBe(200);

    const rows = await paymentsOf(db, organizationId);
    expect(rows).toHaveLength(2);
    const renewal = rows.find((row) => row.chargeId === "chg_renewal");
    expect(renewal).toBeDefined();
    expect(renewal?.checkoutId).toBeNull();
    expect(renewal?.periodEndsAt?.getTime()).toBe(
      runningUntil.getTime() + 30 * DAY_MS,
    );
  });

  it("stores the card a saved-payment delivery names, against its customer", async () => {
    const organizationId = "org-webhook-card";
    await db.insert(billingCustomer).values({
      organizationId,
      customerId: "cust_card",
      autoRenew: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await deliver(
      eventBody({
        organizationId,
        type: "payment_method.saved",
        customerId: "cust_card",
        paymentMethodId: "pm_visa",
        cardLast4: "1881",
      }),
    );
    expect(response.status).toBe(200);

    const customer = await customerOf(db, organizationId);
    expect(customer?.paymentMethodId).toBe("pm_visa");
    expect(customer?.cardBrand).toBe("visa");
    expect(customer?.cardLast4).toBe("1881");
    expect(customer?.autoRenew).toBe(true);
  });

  it("stops renewing when the card refuses the charge, and forgets it", async () => {
    const organizationId = "org-webhook-failed";
    await db.insert(billingCustomer).values({
      organizationId,
      customerId: "cust_failed",
      paymentMethodId: "pm_visa",
      autoRenew: true,
      pendingChargeId: "chg_refused",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await deliver(
      eventBody({
        organizationId,
        type: "collection.failed",
        checkoutId: null,
        chargeId: "chg_refused",
        status: "FAILED",
      }),
    );
    expect(response.status).toBe(200);

    const customer = await customerOf(db, organizationId);
    expect(customer?.autoRenew).toBe(false);
    expect(customer?.pendingChargeId).toBeNull();
  });

  it("refuses a delivery whose signature does not match and writes nothing", async () => {
    const organizationId = "org-webhook-unsigned";
    const body = eventBody({ organizationId });

    const response = await request("/api/webhooks/bachs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bachs-signature-v2": "t=1,v1=deadbeef",
      },
      body,
    });
    expect(response.status).toBe(400);
    expect(await paymentsOf(db, organizationId)).toHaveLength(0);
  });

  it("refuses a delivery signed with the wrong secret and writes nothing", async () => {
    const organizationId = "org-webhook-wrong-secret";
    const body = eventBody({ organizationId });
    const seconds = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("whsec_someone_else"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${seconds}.${body}`),
      ),
    );
    const hex = [...digest]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const response = await request("/api/webhooks/bachs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bachs-signature-v2": `t=${seconds},v1=${hex}`,
      },
      body,
    });
    expect(response.status).toBe(400);
    expect(await paymentsOf(db, organizationId)).toHaveLength(0);
  });
});

describe("reading the plan back", () => {
  it("reports the USD plans and the period the organization paid for", async () => {
    const { cookie, organizationId } = await signedInOwner();

    await deliver(
      eventBody({
        organizationId,
        checkoutId: "chk_summary",
        chargeId: "chg_summary",
        amount: "50.00",
        cadence: "yearly",
      }),
    );
    await db.insert(billingCustomer).values({
      organizationId,
      customerId: "cust_summary",
      paymentMethodId: "pm_summary",
      cardLast4: "4242",
      autoRenew: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const response = await request("/api/billing", { headers: { cookie } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      configured: boolean;
      entitled: boolean;
      paidUntil: string | null;
      cadence: string | null;
      autoRenew: boolean;
      hasCard: boolean;
      cardLast4: string | null;
      plans: Array<{ cadence: string; amount: string; currency: string }>;
    };
    expect(body.configured).toBe(true);
    expect(body.entitled).toBe(true);
    expect(body.cadence).toBe("yearly");
    expect(body.paidUntil).not.toBeNull();
    expect(body.autoRenew).toBe(true);
    expect(body.hasCard).toBe(true);
    expect(body.cardLast4).toBe("4242");
    expect(body.plans.map((plan) => [plan.cadence, plan.amount, plan.currency]))
      .toEqual([
        ["monthly", "5.00", "USD"],
        ["yearly", "50.00", "USD"],
      ]);
  });

  it("reports no paid period for an organization that has never paid", async () => {
    const { cookie } = await signedInOwner();

    const response = await request("/api/billing", { headers: { cookie } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      paidUntil: string | null;
      cadence: string | null;
      hasCard: boolean;
      autoRenew: boolean;
    };
    expect(body.paidUntil).toBeNull();
    expect(body.cadence).toBeNull();
    expect(body.hasCard).toBe(false);
    expect(body.autoRenew).toBe(false);
  });
});
