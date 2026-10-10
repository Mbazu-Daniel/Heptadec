import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { db, schema } from "@heptadec/db";
import { auth } from "../src/common/config/better-auth";
import { app, signUp, uniqueEmail, uniqueSlug } from "./helpers";

const { organization, member, invitation, session } = schema;

it("stores the organization, the owner membership, and the active organization", async () => {
  const { user: created, cookie } = await signUp(uniqueEmail());
  const slug = uniqueSlug();

  const createdOrg = await auth.api.createOrganization({
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

  const createdOrg = await auth.api.createOrganization({
    body: { name: "Beta Labs", slug },
    headers: { cookie },
  });

  await auth.api.createInvitation({
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

  const first = await auth.api.createOrganization({
    body: { name: "First Org", slug: firstSlug },
    headers: { cookie },
  });
  const second = await auth.api.createOrganization({
    body: { name: "Second Org", slug: secondSlug },
    headers: { cookie },
  });

  const res = await app.request("/api/organization/switch", {
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

  const createdOrg = await auth.api.createOrganization({
    body: { name: "Gamma Group", slug },
    headers: { cookie },
  });

  const res = await app.request("/api/organization/member", {
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

  const other = await auth.api.createOrganization({
    body: { name: "Not Mine", slug: uniqueSlug() },
    headers: { cookie: theirCookie },
  });

  const res = await app.request("/api/organization/switch", {
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