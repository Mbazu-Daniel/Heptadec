import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { MCP_TOOLS } from "../src/modules/mcp/contracts";
import { db, request, signUp, uniqueEmail, uniqueSlug } from "./helpers";

const { billingPayment, dataSource, member, organization, shareLink } = schema;

const DAY_MS = 24 * 60 * 60 * 1000;

async function ownerWithOrganization(): Promise<{
  cookie: string;
  userId: string;
  organizationId: string;
}> {
  const { user, cookie } = await signUp(uniqueEmail());
  const created = await authFor(db).api.createOrganization({
    body: { name: "Gate Org", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, userId: user.id, organizationId: created.id };
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

async function ownedOrganizationIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: member.organizationId })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.role, "owner")));
  return rows.map((row) => row.id);
}

async function backdate(organizationId: string, days: number): Promise<void> {
  await db
    .update(organization)
    .set({ createdAt: new Date(Date.now() - days * DAY_MS) })
    .where(eq(organization.id, organizationId));
}

async function lapsePeriod(organizationId: string): Promise<void> {
  await db
    .update(billingPayment)
    .set({ periodEndsAt: new Date(Date.now() - DAY_MS) })
    .where(eq(billingPayment.organizationId, organizationId));
}

async function switchOrganization(
  cookie: string,
  organizationId: string,
): Promise<void> {
  const res = await request("/api/organization/switch", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId }),
  });
  expect(res.status).toBe(200);
}

let checkoutSequence = 0;

async function boughtPeriod(
  organizationId: string,
  endsInDays: number,
): Promise<void> {
  checkoutSequence += 1;
  const now = new Date();
  await db.insert(billingPayment).values({
    organizationId,
    customerId: "cust_gate",
    checkoutId: `chk_gate_${checkoutSequence}`,
    cadence: "monthly",
    amount: "5.00",
    currency: "USD",
    status: "paid",
    periodEndsAt: new Date(now.getTime() + endsInDays * DAY_MS),
    createdAt: now,
  });
}

it("keeps a lone organization usable forever, long past the old trial window", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  await backdate(organizationId, 400);

  const res = await createSource(cookie, "Eternal source");
  expect(res.status).toBe(200);
  expect(await sourcesOf(organizationId)).toHaveLength(1);

  const listed = await request("/api/data-sources", { headers: { cookie } });
  expect(listed.status).toBe(200);
});

it("refuses a second organization for an unpaid owner and writes nothing", async () => {
  const { cookie, userId, organizationId } = await ownerWithOrganization();
  await backdate(organizationId, 400);

  let refused = false;
  try {
    await authFor(db).api.createOrganization({
      body: { name: "Second Org", slug: uniqueSlug() },
      headers: { cookie },
    });
  } catch {
    refused = true;
  }

  expect(refused).toBe(true);
  expect(await ownedOrganizationIds(userId)).toHaveLength(1);
});

it("serializes two concurrent first organizations into one for an unpaid owner", async () => {
  const { user, cookie } = await signUp(uniqueEmail());

  const attempts = await Promise.allSettled([
    authFor(db).api.createOrganization({
      body: { name: "Race A", slug: uniqueSlug() },
      headers: { cookie },
    }),
    authFor(db).api.createOrganization({
      body: { name: "Race B", slug: uniqueSlug() },
      headers: { cookie },
    }),
  ]);

  const succeeded = attempts.filter((attempt) => attempt.status === "fulfilled");
  expect(succeeded).toHaveLength(1);
  expect(await ownedOrganizationIds(user.id)).toHaveLength(1);
});

it("keeps a promoted co-owner's own organization free", async () => {
  const first = await ownerWithOrganization();
  const second = await ownerWithOrganization();

  await db.insert(member).values({
    organizationId: first.organizationId,
    userId: second.userId,
    role: "owner",
    createdAt: new Date(Date.now() + DAY_MS),
  });

  await switchOrganization(second.cookie, second.organizationId);
  const res = await createSource(second.cookie, "B own source");
  expect(res.status).toBe(200);
  expect(await sourcesOf(second.organizationId)).toHaveLength(1);
});

it("does not let another account's payment unlock a co-owner", async () => {
  const first = await ownerWithOrganization();
  const second = await ownerWithOrganization();
  await db.insert(member).values({
    organizationId: first.organizationId,
    userId: second.userId,
    role: "owner",
    createdAt: new Date(Date.now() + DAY_MS),
  });

  await boughtPeriod(first.organizationId, 30);

  await switchOrganization(second.cookie, second.organizationId);
  const billing = await request("/api/billing", { headers: { cookie: second.cookie } });
  expect(billing.status).toBe(200);
  expect(await billing.json()).toMatchObject({
    configured: true,
    accountPaid: false,
    organizationsOwned: 1,
  });

  let refused = false;
  try {
    await authFor(db).api.createOrganization({
      body: { name: "B second", slug: uniqueSlug() },
      headers: { cookie: second.cookie },
    });
  } catch {
    refused = true;
  }
  expect(refused).toBe(true);
  const after = await request("/api/billing", { headers: { cookie: second.cookie } });
  expect(await after.json()).toMatchObject({ organizationsOwned: 1 });
});

it("lets an owner add organizations once the account pays", async () => {
  const { cookie, userId, organizationId } = await ownerWithOrganization();
  await boughtPeriod(organizationId, 30);

  const second = await authFor(db).api.createOrganization({
    body: { name: "Second Org", slug: uniqueSlug() },
    headers: { cookie },
  });

  const owned = await ownedOrganizationIds(userId);
  expect(owned).toHaveLength(2);
  expect(owned).toContain(second.id);
});

it("keeps the oldest organization free while a lapsed extra one is locked", async () => {
  const { cookie, organizationId: first } = await ownerWithOrganization();
  await boughtPeriod(first, 30);
  const second = await authFor(db).api.createOrganization({
    body: { name: "Second Org", slug: uniqueSlug() },
    headers: { cookie },
  });
  await lapsePeriod(first);

  await switchOrganization(cookie, second.id);
  const refused = await createSource(cookie, "Locked extra");
  expect(refused.status).toBe(402);
  expect(await sourcesOf(second.id)).toHaveLength(0);

  await switchOrganization(cookie, first);
  const kept = await createSource(cookie, "Free oldest");
  expect(kept.status).toBe(200);
  expect(await sourcesOf(first)).toHaveLength(1);
});

it("reports the free plan through the routes an owner needs to pay", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  await backdate(organizationId, 400);

  const me = await request("/api/me", { headers: { cookie } });
  expect(me.status).toBe(200);

  const org = await request("/api/organization", { headers: { cookie } });
  expect(org.status).toBe(200);

  const billing = await request("/api/billing", { headers: { cookie } });
  expect(billing.status).toBe(200);
  const summary = (await billing.json()) as Record<string, unknown>;
  expect(summary).toMatchObject({
    configured: true,
    entitled: true,
    accountPaid: false,
    paidUntil: null,
    organizationsOwned: 1,
    freeOrgLimit: 1,
  });
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

it("serves a lone organization's MCP token forever, but locks a lapsed extra one", async () => {
  const { cookie, organizationId: first } = await ownerWithOrganization();
  const loneToken = await issueToken(cookie);
  await backdate(first, 400);
  expect((await mcp(loneToken)).status).not.toBe(402);

  await boughtPeriod(first, 30);
  const second = await authFor(db).api.createOrganization({
    body: { name: "Second Org", slug: uniqueSlug() },
    headers: { cookie },
  });
  await switchOrganization(cookie, second.id);
  const extraToken = await issueToken(cookie);
  await lapsePeriod(first);

  expect((await mcp(extraToken)).status).toBe(402);
  expect((await mcp(loneToken)).status).not.toBe(402);
});

it("keeps serving a lone organization's share link, but stops a lapsed extra one", async () => {
  const { cookie, organizationId: first } = await ownerWithOrganization();
  await boughtPeriod(first, 30);
  const second = await authFor(db).api.createOrganization({
    body: { name: "Second Org", slug: uniqueSlug() },
    headers: { cookie },
  });

  const token = `sgl_gate_${second.id}`;
  const now = new Date();
  await db.insert(shareLink).values({
    organizationId: second.id,
    dashboardId: "dash_gate",
    tokenHash: createHash("sha256").update(token).digest("hex"),
    snapshot: JSON.stringify({ name: "Ops", widgets: [] }),
    expiresAt: null,
    createdAt: now,
    updatedAt: now,
  });

  expect(
    (
      await request(`/api/share/${token}`, {
        headers: { "x-forwarded-for": "10.9.9.9" },
      })
    ).status,
  ).toBe(200);

  await lapsePeriod(first);

  expect(
    (
      await request(`/api/share/${token}`, {
        headers: { "x-forwarded-for": "10.9.9.10" },
      })
    ).status,
  ).toBe(404);
});
