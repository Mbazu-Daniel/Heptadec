import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { request, signUp, uniqueEmail, uniqueSlug, db } from "./helpers";

const {
  organization,
  member,
  invitation,
  session,
  aiChat,
  aiProvider,
  alertDelivery,
  alertRule,
  auditLog,
  billingSubscription,
  dashboard,
  dashboardDataSource,
  dataSource,
  notificationChannel,
  queryResult,
  queryVersion,
  savedQuery,
  scheduledJob,
  shareLink,
  widget,
} = schema;

it("stores the organization, the owner membership, and the active organization", async () => {
  const { user: created, cookie } = await signUp(uniqueEmail());
  const slug = uniqueSlug();

  const createdOrg = await authFor(db).api.createOrganization({
    body: { name: "Acme Data", slug },
    headers: { cookie },
  });

  const orgs = await db.select().from(organization).where(eq(organization.slug, slug));
  expect(orgs).toHaveLength(1);
  expect(orgs[0]).toMatchObject({ id: createdOrg.id, name: "Acme Data" });

  const members = await db
    .select()
    .from(member)
    .where(eq(member.organizationId, createdOrg.id));
  expect(members).toHaveLength(1);
  expect(members[0]).toMatchObject({ userId: created.id, role: "owner" });

  const sessions = await db
    .select()
    .from(session)
    .where(eq(session.userId, created.id));
  expect(sessions[0]!.activeOrganizationId).toBe(createdOrg.id);
});

it("stores an invitation with its role and a pending status", async () => {
  const { cookie } = await signUp(uniqueEmail());
  const slug = uniqueSlug();

  const createdOrg = await authFor(db).api.createOrganization({
    body: { name: "Beta Labs", slug },
    headers: { cookie },
  });

  await authFor(db).api.createInvitation({
    body: {
      email: "grace.hopper@example.com",
      role: "viewer",
      organizationId: createdOrg.id,
    },
    headers: { cookie },
  });

  const rows = await db
    .select()
    .from(invitation)
    .where(eq(invitation.organizationId, createdOrg.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    email: "grace.hopper@example.com",
    role: "viewer",
    status: "pending",
  });
  expect(rows[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now());
});

it("switches the active organization in the session row", async () => {
  const { user: created, cookie } = await signUp(uniqueEmail());
  const firstSlug = uniqueSlug();
  const secondSlug = uniqueSlug();

  const first = await authFor(db).api.createOrganization({
    body: { name: "First Org", slug: firstSlug },
    headers: { cookie },
  });
  const second = await authFor(db).api.createOrganization({
    body: { name: "Second Org", slug: secondSlug },
    headers: { cookie },
  });

  const res = await request("/api/organization/switch", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId: first.id }),
  });
  expect(res.status).toBe(200);

  const sessions = await db
    .select()
    .from(session)
    .where(eq(session.userId, created.id));
  expect(sessions).toHaveLength(1);
  expect(sessions[0]!.activeOrganizationId).toBe(first.id);
  expect(sessions[0]!.activeOrganizationId).not.toBe(second.id);
});

it("writes the member display name against the active organization only", async () => {
  const { cookie } = await signUp(uniqueEmail());
  const slug = uniqueSlug();

  const createdOrg = await authFor(db).api.createOrganization({
    body: { name: "Gamma Group", slug },
    headers: { cookie },
  });

  const res = await request("/api/organization/member", {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Platform Lead" }),
  });
  expect(res.status).toBe(200);

  const members = await db
    .select()
    .from(member)
    .where(eq(member.organizationId, createdOrg.id));
  expect(members).toHaveLength(1);
  expect(members[0]!.displayName).toBe("Platform Lead");
});

it("refuses to switch into an organization the user does not belong to", async () => {
  const { user: mine, cookie: myCookie } = await signUp(uniqueEmail());
  const { cookie: theirCookie } = await signUp(uniqueEmail());

  const other = await authFor(db).api.createOrganization({
    body: { name: "Not Mine", slug: uniqueSlug() },
    headers: { cookie: theirCookie },
  });

  const res = await request("/api/organization/switch", {
    method: "POST",
    headers: { cookie: myCookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId: other.id }),
  });
  expect(res.status).toBe(403);

  const members = await db
    .select()
    .from(member)
    .where(eq(member.organizationId, other.id));
  expect(members).toHaveLength(1);
  expect(members[0]!.userId).not.toBe(mine.id);

  const sessions = await db
    .select()
    .from(session)
    .where(eq(session.userId, mine.id));
  expect(sessions[0]!.activeOrganizationId ?? null).not.toBe(other.id);
});

it("deletes every row the organization owns", async () => {
  const { cookie } = await signUp(uniqueEmail());
  const slug = uniqueSlug();
  const created = await authFor(db).api.createOrganization({
    body: { name: "Disposable", slug },
    headers: { cookie },
  });
  const orgId = created.id;
  const now = new Date();
  const dataSourceId = `ds_${orgId}`;
  const savedQueryId = `sq_${orgId}`;
  const dashboardId = `db_${orgId}`;
  const alertRuleId = `ar_${orgId}`;

  await db.insert(dataSource).values({
    id: dataSourceId,
    organizationId: orgId,
    kind: "postgres",
    name: "Source",
    readOnly: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(savedQuery).values({
    id: savedQueryId,
    organizationId: orgId,
    dataSourceId,
    name: "Query",
    sql: "SELECT 1",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(queryVersion).values({
    organizationId: orgId,
    savedQueryId,
    name: "Query",
    sql: "SELECT 1",
    createdAt: now,
  });
  await db.insert(queryResult).values({
    organizationId: orgId,
    savedQueryId,
    ranAt: now,
    ttlSeconds: 60,
    payload: "{}",
  });
  await db.insert(dashboard).values({
    id: dashboardId,
    organizationId: orgId,
    name: "Dashboard",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(dashboardDataSource).values({
    organizationId: orgId,
    dashboardId,
    dataSourceId,
    createdAt: now,
  });
  await db.insert(widget).values({
    organizationId: orgId,
    dashboardId,
    savedQueryId,
    chartType: "bar",
    title: "Chart",
    labelColumn: "a",
    valueColumn: "b",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(shareLink).values({
    organizationId: orgId,
    dashboardId,
    tokenHash: "hash",
    snapshot: "{}",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(scheduledJob).values({
    organizationId: orgId,
    savedQueryId,
    name: "Job",
    cron: "0 * * * *",
    timezone: "UTC",
    ttlSeconds: 60,
    nextRunAt: now,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(alertRule).values({
    id: alertRuleId,
    organizationId: orgId,
    savedQueryId,
    name: "Rule",
    column: "a",
    operator: ">",
    threshold: 1,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(alertDelivery).values({
    organizationId: orgId,
    alertRuleId,
    channel: "slack",
    status: "sent",
    message: "breach",
    createdAt: now,
  });
  await db.insert(notificationChannel).values({
    organizationId: orgId,
    name: "Slack",
    kind: "slack",
    recipients: "[]",
    config: "{}",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(aiProvider).values({
    organizationId: orgId,
    name: "Provider",
    provider: "openai",
    model: "gpt",
    apiKey: "key",
    isDefault: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(aiChat).values({
    organizationId: orgId,
    dataSourceId,
    providerName: "Provider",
    model: "gpt",
    question: "question",
    durationMs: 1,
    createdAt: now,
  });
  await db.insert(auditLog).values({
    organizationId: orgId,
    occurredAt: now,
    actorId: "actor",
    actorLabel: "Actor",
    event: "test.event",
    targetKind: "test",
  });
  await db.insert(billingSubscription).values({
    organizationId: orgId,
    customerId: "cust",
    subscriptionId: "sub",
    productId: "prod",
    status: "active",
    cancelAtPeriodEnd: false,
    eventCreatedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const res = await request("/api/organization/delete", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  expect(res.status).toBe(200);

  const tables = [
    ["aiChat", aiChat],
    ["aiProvider", aiProvider],
    ["alertDelivery", alertDelivery],
    ["alertRule", alertRule],
    ["auditLog", auditLog],
    ["billingSubscription", billingSubscription],
    ["dashboard", dashboard],
    ["dashboardDataSource", dashboardDataSource],
    ["dataSource", dataSource],
    ["notificationChannel", notificationChannel],
    ["queryResult", queryResult],
    ["queryVersion", queryVersion],
    ["savedQuery", savedQuery],
    ["scheduledJob", scheduledJob],
    ["shareLink", shareLink],
    ["widget", widget],
  ] as const;

  for (const [name, table] of tables) {
    const rows = await db
      .select()
      .from(table)
      .where(eq(table.organizationId, orgId));
    expect(rows, `${name} should be empty`).toHaveLength(0);
  }

  const organizations = await db
    .select()
    .from(organization)
    .where(eq(organization.id, orgId));
  expect(organizations).toHaveLength(0);
});