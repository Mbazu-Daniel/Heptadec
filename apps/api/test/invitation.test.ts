import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { request, signUp, uniqueEmail, uniqueSlug, db } from "./helpers";

const { invitation, member, user } = schema;

async function verifyEmail(userId: string): Promise<void> {
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));
}

async function ownerWithOrganization(): Promise<{
  cookie: string;
  organizationId: string;
}> {
  const { cookie } = await signUp(uniqueEmail());
  const created = await authFor(db).api.createOrganization({
    body: { name: "Delta Works", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, organizationId: created.id };
}

it("stores an invitation that an owner sends through the api", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/organization/invitations", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ email: "invitee@example.com", role: "viewer" }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(invitation)
    .where(eq(invitation.organizationId, organizationId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    email: "invitee@example.com",
    role: "viewer",
    status: "pending",
  });
});

it("refuses an invitation from a member who is not the owner", async () => {
  const { organizationId } = await ownerWithOrganization();
  const { user: viewer, cookie: viewerCookie } = await signUp(uniqueEmail());

  await authFor(db).api.addMember({
    body: { userId: viewer.id, role: "viewer", organizationId },
  });
  await request("/api/organization/switch", {
    method: "POST",
    headers: { cookie: viewerCookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId }),
  });

  const res = await request("/api/organization/invitations", {
    method: "POST",
    headers: { cookie: viewerCookie, "content-type": "application/json" },
    body: JSON.stringify({ email: "sneaky@example.com", role: "editor" }),
  });
  expect(res.status).toBe(403);

  const rows = await db
    .select()
    .from(invitation)
    .where(eq(invitation.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("rejects an invitation to an address that is not an email", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/organization/invitations", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ email: "not-an-address", role: "viewer" }),
  });
  expect(res.status).toBe(400);

  const rows = await db
    .select()
    .from(invitation)
    .where(eq(invitation.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});
it("reads an invitation back for someone who is not signed in", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const invited = uniqueEmail();
  await request("/api/organization/invitations", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ email: invited, role: "editor" }),
  });

  const rows = await db
    .select({ id: invitation.id, organizationId: invitation.organizationId })
    .from(invitation)
    .where(eq(invitation.email, invited));
  expect(rows[0]!.organizationId).toBe(organizationId);

  const res = await request(`/api/invitation/${rows[0]!.id}`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { email: string; role: string };
  expect(body.email).toBe(invited);
  expect(body.role).toBe("editor");
});

it("creates the membership and flips the invitation when accepted", async () => {
  const invited = uniqueEmail();
  const { cookie, organizationId } = await ownerWithOrganization();
  await request("/api/organization/invitations", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ email: invited, role: "editor" }),
  });

  const row = (await db.select().from(invitation).where(eq(invitation.email, invited)))[0]!;
  const guest = await signUp(invited);
  await verifyEmail(guest.user.id);

  const res = await request(`/api/invitation/${row.id}/accept`, {
    method: "POST",
    headers: { cookie: guest.cookie },
  });
  expect(res.status).toBe(200);

  const members = await db
    .select({ userId: member.userId, role: member.role })
    .from(member)
    .where(eq(member.organizationId, organizationId));
  const joined = members.filter((row) => row.userId === guest.user.id);
  expect(joined).toHaveLength(1);
  expect(joined[0]!.role).toBe("editor");

  const after = await db.select().from(invitation).where(eq(invitation.id, row.id));
  expect(after[0]!.status).toBe("accepted");
});

it("refuses an acceptance from someone the invitation was not sent to", async () => {
  const { cookie } = await ownerWithOrganization();
  const invited = uniqueEmail();
  await request("/api/organization/invitations", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ email: invited, role: "editor" }),
  });

  const row = (await db.select().from(invitation).where(eq(invitation.email, invited)))[0]!;
  const stranger = await signUp(uniqueEmail());

  const res = await request(`/api/invitation/${row.id}/accept`, {
    method: "POST",
    headers: { cookie: stranger.cookie },
  });
  expect(res.status).toBeGreaterThanOrEqual(400);

  const members = await db.select().from(member).where(eq(member.userId, stranger.user.id));
  expect(members).toHaveLength(0);

  const after = await db.select().from(invitation).where(eq(invitation.id, row.id));
  expect(after[0]!.status).toBe("pending");
});

it("will not preview an invitation that does not exist", async () => {
  const res = await request("/api/invitation/00000000-0000-4000-8000-000000000000");
  expect(res.status).toBe(404);
});

it("refuses an expired invitation and leaves the membership untouched", async () => {
  const invited = uniqueEmail();
  const { cookie, organizationId } = await ownerWithOrganization();
  await request("/api/organization/invitations", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ email: invited, role: "editor" }),
  });

  const row = (await db.select().from(invitation).where(eq(invitation.email, invited)))[0]!;
  await db
    .update(invitation)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(invitation.id, row.id));

  const guest = await signUp(invited);
  await verifyEmail(guest.user.id);

  const preview = await request(`/api/invitation/${row.id}`);
  expect(preview.status).toBe(404);

  const res = await request(`/api/invitation/${row.id}/accept`, {
    method: "POST",
    headers: { cookie: guest.cookie },
  });
  expect(res.status).toBeGreaterThanOrEqual(400);

  const members = await db
    .select()
    .from(member)
    .where(eq(member.organizationId, organizationId));
  expect(members.filter((m) => m.userId === guest.user.id)).toHaveLength(0);

  const after = await db.select().from(invitation).where(eq(invitation.id, row.id));
  expect(after[0]!.status).toBe("pending");
});

it("refuses to cancel another organization's invitation and leaves it pending", async () => {
  const invited = uniqueEmail();
  const mine = await ownerWithOrganization();
  await request("/api/organization/invitations", {
    method: "POST",
    headers: { cookie: mine.cookie, "content-type": "application/json" },
    body: JSON.stringify({ email: invited, role: "editor" }),
  });

  const row = (await db.select().from(invitation).where(eq(invitation.email, invited)))[0]!;
  const other = await ownerWithOrganization();
  const res = await request(`/api/organization/invitations/${row.id}`, {
    method: "DELETE",
    headers: { cookie: other.cookie },
  });
  expect(res.status).toBe(404);

  const after = await db.select().from(invitation).where(eq(invitation.id, row.id));
  expect(after[0]!.status).toBe("pending");
  expect(after[0]!.organizationId).toBe(mine.organizationId);
});
