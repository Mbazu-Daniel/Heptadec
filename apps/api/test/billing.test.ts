import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema } from "@heptadec/db";
import { config } from "../src/common/config/env";
import { authFor } from "../src/common/config/better-auth";
import { db, request, signUp, uniqueEmail, uniqueSlug } from "./helpers";

const { billingSubscription } = schema;

const WEBHOOK_SECRET = config.bachs.webhookSecret;
interface IEventInput {
  type?: string;
  createdAt?: string;
  organizationId: string;
  subscriptionId?: string;
  customerId?: string;
  productId?: string;
  status?: string;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
}

function eventBody(input: IEventInput): string {
  return JSON.stringify({
    id: "evt_test",
    type: input.type ?? "customer.subscription.created",
    created_at: input.createdAt ?? "2026-10-17T10:00:00.000000+00:00",
    organization_id: "acct_test",
    data: {
      subscription_id: input.subscriptionId ?? "sub_test",
      customer: { customer_id: input.customerId ?? "cust_test" },
      product_id: input.productId ?? "prod_test_monthly",
      status: input.status ?? "active",
      current_period_end: input.currentPeriodEnd ?? "2026-11-17T10:00:00Z",
      cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
      metadata: { organization_id: input.organizationId },
    },
  });
}

async function signature(header: {
  raw: string;
  seconds: number;
}): Promise<string> {
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
      new TextEncoder().encode(`${header.seconds}.${header.raw}`),
    ),
  );
  const hex = [...digest]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `t=${header.seconds},v1=${hex}`;
}

async function deliver(body: string, seconds?: number): Promise<Response> {
  const at = seconds ?? Math.floor(Date.now() / 1000);
  return request("/api/webhooks/bachs", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bachs-signature-v2": await signature({ raw: body, seconds: at }),
    },
    body,
  });
}

async function signedInOwner(): Promise<{ cookie: string; organizationId: string }> {
  const { cookie } = await signUp(uniqueEmail());
  const created = await authFor(db).api.createOrganization({
    body: { name: "Billing Test", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, organizationId: created.id };
}

async function stored(organizationId: string) {
  const rows = await db
    .select()
    .from(billingSubscription)
    .where(eq(billingSubscription.organizationId, organizationId));
  return rows[0];
}

describe("Bachs subscription webhooks", () => {
  beforeEach(async () => {
    await db.delete(billingSubscription);
  });

  it("stores the subscription a signed delivery describes", async () => {
    const organizationId = "org-webhook-created";
    const response = await deliver(
      eventBody({
        organizationId,
        status: "active",
        currentPeriodEnd: "2026-11-17T10:00:00Z",
      }),
    );
    expect(response.status).toBe(200);

    const row = await stored(organizationId);
    expect(row).toBeDefined();
    expect(row?.subscriptionId).toBe("sub_test");
    expect(row?.customerId).toBe("cust_test");
    expect(row?.productId).toBe("prod_test_monthly");
    expect(row?.status).toBe("active");
    expect(row?.cancelAtPeriodEnd).toBe(false);
    expect(row?.currentPeriodEnd?.toISOString()).toBe("2026-11-17T10:00:00.000Z");
  });

  it("refuses a delivery whose signature does not match", async () => {
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
    expect(await stored(organizationId)).toBeUndefined();
  });

  it("refuses a delivery signed with the wrong secret", async () => {
    const organizationId = "org-webhook-wrong-secret";
    const body = eventBody({ organizationId });
    const at = Math.floor(Date.now() / 1000);
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
        new TextEncoder().encode(`${at}.${body}`),
      ),
    );
    const hex = [...digest]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const response = await request("/api/webhooks/bachs", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bachs-signature-v2": `t=${at},v1=${hex}`,
      },
      body,
    });
    expect(response.status).toBe(400);
    expect(await stored(organizationId)).toBeUndefined();
  });

  it("leaves the row alone when an older delivery arrives after a newer one", async () => {
    const organizationId = "org-webhook-out-of-order";
    await deliver(
      eventBody({
        organizationId,
        type: "customer.subscription.updated",
        status: "canceled",
        createdAt: "2026-10-17T12:00:00.000000+00:00",
      }),
    );

    const stale = await deliver(
      eventBody({
        organizationId,
        type: "customer.subscription.updated",
        status: "active",
        createdAt: "2026-10-17T11:00:00.000000+00:00",
      }),
    );
    expect(stale.status).toBe(200);

    expect((await stored(organizationId))?.status).toBe("canceled");
  });

  it("reports the stored subscription to the organization that owns it", async () => {
    const { cookie, organizationId } = await signedInOwner();

    await deliver(
      eventBody({
        organizationId,
        type: "customer.subscription.updated",
        status: "past_due",
        cancelAtPeriodEnd: true,
      }),
    );

    const response = await request("/api/billing", {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      configured: boolean;
      plans: Array<{ cadence: string; amount: string }>;
      subscription: {
        status: string;
        cadence: string | null;
        cancelAtPeriodEnd: boolean;
      } | null;
    };
    expect(body.configured).toBe(true);
    expect(body.plans.map((plan) => [plan.cadence, plan.amount])).toEqual([
      ["monthly", "5.00"],
      ["yearly", "50.00"],
    ]);
    expect(body.subscription?.status).toBe("past_due");
    expect(body.subscription?.cadence).toBe("monthly");
    expect(body.subscription?.cancelAtPeriodEnd).toBe(true);
  });

  it("reports no subscription for an organization that has never paid", async () => {
    const { cookie } = await signedInOwner();
    const response = await request("/api/billing", { headers: { cookie } });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { subscription: unknown };
    expect(body.subscription).toBeNull();
  });

  it("keeps one row per organization when a subscription is replaced", async () => {
    const organizationId = "org-webhook-replaced";
    await deliver(eventBody({ organizationId, subscriptionId: "sub_first" }));
    await deliver(
      eventBody({
        organizationId,
        subscriptionId: "sub_second",
        type: "customer.subscription.created",
        createdAt: "2026-10-17T13:00:00.000000+00:00",
      }),
    );

    const rows = await db
      .select()
      .from(billingSubscription)
      .where(eq(billingSubscription.organizationId, organizationId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subscriptionId).toBe("sub_second");
  });
});

describe("starting a checkout", () => {
  it("refuses a viewer and writes nothing", async () => {
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
    expect(await stored(organizationId)).toBeUndefined();
  });
});
