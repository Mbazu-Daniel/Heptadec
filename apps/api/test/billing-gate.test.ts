import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { MCP_TOOLS } from "../src/modules/mcp/contracts";
import { TRIAL_DAYS } from "../src/modules/billing/entitlement";
import { db, request, signUp, uniqueEmail, uniqueSlug } from "./helpers";

const { billingSubscription, dataSource, organization, shareLink } = schema;

const DAY_MS = 24 * 60 * 60 * 1000;

async function ownerWithOrganization(): Promise<{
  cookie: string;
  organizationId: string;
}> {
  const { cookie } = await signUp(uniqueEmail());
  const created = await authFor(db).api.createOrganization({
    body: { name: "Gate Org", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, organizationId: created.id };
}

function postgresInput(name: string) {
  return {
    kind: "postgres",
    name,
    host: "db.internal",
    port: 5432,
    database: "warehouse",
    username: "readonly_svc",
    password: "s3cret-password",
  };
}

function createSource(cookie: string, name: string): Promise<Response> {
  return request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(postgresInput(name)),
  });
}

function sourcesOf(organizationId: string) {
  return db.select().from(dataSource).where(eq(dataSource.organizationId, organizationId));
}

async function spendTrial(organizationId: string): Promise<void> {
  await db
    .update(organization)
    .set({ createdAt: new Date(Date.now() - (TRIAL_DAYS + 1) * DAY_MS) })
    .where(eq(organization.id, organizationId));
}

async function subscribe(
  organizationId: string,
  status: string,
  productId = "prod_test_monthly",
): Promise<void> {
  const now = new Date();
  await db.insert(billingSubscription).values({
    organizationId,
    customerId: "cust_gate",
    subscriptionId: "sub_gate",
    productId,
    status,
    currentPeriodEnd: new Date(now.getTime() + 30 * DAY_MS),
    cancelAtPeriodEnd: false,
    eventCreatedAt: now,
    createdAt: now,
    updatedAt: now,
  });
}

it("lets a new organization use the product for its trial", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await createSource(cookie, "Trial source");

  expect(res.status).toBe(200);
  expect(await sourcesOf(organizationId)).toHaveLength(1);
});

it("refuses the product once the trial has run out, and writes nothing", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  await spendTrial(organizationId);

  const res = await createSource(cookie, "Locked out");
  expect(res.status).toBe(402);
  expect(await sourcesOf(organizationId)).toHaveLength(0);

  const listed = await request("/api/data-sources", { headers: { cookie } });
  expect(listed.status).toBe(402);
});

it("lets a subscribed organization back in after its trial", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  await spendTrial(organizationId);
  await subscribe(organizationId, "active");

  const res = await createSource(cookie, "Paid source");

  expect(res.status).toBe(200);
  expect(await sourcesOf(organizationId)).toHaveLength(1);
});

it("keeps letting in an organization whose card is being retried", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  await spendTrial(organizationId);
  await subscribe(organizationId, "past_due");

  const res = await createSource(cookie, "Retrying source");

  expect(res.status).toBe(200);
  expect(await sourcesOf(organizationId)).toHaveLength(1);
});

it("refuses an organization whose subscription was cancelled", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  await spendTrial(organizationId);
  await subscribe(organizationId, "canceled");

  const res = await createSource(cookie, "Cancelled source");

  expect(res.status).toBe(402);
  expect(await sourcesOf(organizationId)).toHaveLength(0);
});

it("refuses an organization subscribed to a product of its own", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  await spendTrial(organizationId);
  await subscribe(organizationId, "active", "prod_somebody_elses");

  const res = await createSource(cookie, "Someone else's source");

  expect(res.status).toBe(402);
  expect(await sourcesOf(organizationId)).toHaveLength(0);
});

it("still answers the routes an organization needs in order to pay", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  await spendTrial(organizationId);

  const me = await request("/api/me", { headers: { cookie } });
  expect(me.status).toBe(200);

  const org = await request("/api/organization", { headers: { cookie } });
  expect(org.status).toBe(200);

  const billing = await request("/api/billing", { headers: { cookie } });
  expect(billing.status).toBe(200);
  const summary = (await billing.json()) as {
    configured: boolean;
    entitled: boolean;
    trialEndsAt: string;
    subscription: unknown;
  };
  expect(summary).toMatchObject({
    configured: true,
    entitled: false,
    subscription: null,
  });
  expect(new Date(summary.trialEndsAt).getTime()).toBeLessThan(Date.now());
  expect(await sourcesOf(organizationId)).toHaveLength(0);
});

function mcp(token: string): Promise<Response> {
  return request("/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
  });
}

async function issueToken(cookie: string): Promise<string> {
  const res = await request("/api/mcp-tokens", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "laptop", capabilities: [...MCP_TOOLS] }),
  });
  const text = await res.text();
  expect(res.status, text).toBe(201);
  return (JSON.parse(text) as { token: string }).token;
}

it("refuses an MCP token belonging to a lapsed organization", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const token = await issueToken(cookie);

  const whileTrialing = await mcp(token);
  expect(whileTrialing.status).not.toBe(402);

  await spendTrial(organizationId);

  const lapsed = await mcp(token);
  expect(lapsed.status).toBe(402);
});

it("stops serving a lapsed organization's share link", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const created = await createSource(cookie, "Shared source");
  expect(created.status).toBe(200);

  const token = `sgl_gate_${organizationId}`;
  const now = new Date();
  await db.insert(shareLink).values({
    organizationId,
    dashboardId: "dash_gate",
    tokenHash: createHash("sha256").update(token).digest("hex"),
    snapshot: JSON.stringify({ name: "Ops", widgets: [] }),
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  });

  const served = await request(`/api/share/${token}`, {
    headers: { "x-forwarded-for": "10.9.9.9" },
  });
  expect(served.status).toBe(200);

  await spendTrial(organizationId);

  const after = await request(`/api/share/${token}`, {
    headers: { "x-forwarded-for": "10.9.9.10" },
  });
  expect(after.status).toBe(404);
});
