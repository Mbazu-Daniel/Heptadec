import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { request, signUp, uniqueEmail, uniqueSlug, db } from "./helpers";

const { invitation, member, user } = schema;

async function ownerWithOrganization(): Promise<{
  cookie: string;
  organizationId: string;
}> {
  const { cookie } = await signUp(uniqueEmail());
  const created = await authFor(db).api.createOrganization({
    body: { name: "Meridian", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, organizationId: created.id };
}

it("lists the members of the active organization", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const other = await signUp(uniqueEmail());
  await authFor(db).api.addMember({
    body: { userId: other.user.id, role: "editor", organizationId },
    headers: { cookie },
  });

  const res = await request("/api/organization/members", {
    headers: { cookie },
  });
  expect(res.status).toBe(200);

  const body = (await res.json()) as {
    members: Array<{ email: string; role: string; isYou: boolean }>;
  };
  expect(body.members).toHaveLength(2);
  expect(body.members.filter((m) => m.isYou)).toHaveLength(1);
  expect(body.members.map((m) => m.role).sort()).toEqual(["editor", "owner"]);
});

it("changes a member's role and stores it", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const editor = await signUp(uniqueEmail());
  await authFor(db).api.addMember({
    body: { userId: editor.user.id, role: "editor", organizationId },
    headers: { cookie },
  });

  const row = (await db.select().from(member).where(eq(member.userId, editor.user.id)))[0]!;

  const res = await request(`/api/organization/members/${row.id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ role: "viewer" }),
  });
  expect(res.status).toBe(200);

  const after = await db.select().from(member).where(eq(member.id, row.id));
  expect(after[0]!.role).toBe("viewer");
});

it("refuses a role change from a member who is not the owner", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const editor = await signUp(uniqueEmail());
  await authFor(db).api.addMember({
    body: { userId: editor.user.id, role: "editor", organizationId },
    headers: { cookie },
  });
  const victim = await signUp(uniqueEmail());
  await authFor(db).api.addMember({
    body: { userId: victim.user.id, role: "viewer", organizationId },
    headers: { cookie },
  });
  const victimRow = (await db.select().from(member).where(eq(member.userId, victim.user.id)))[0]!;
  const editorRow = (await db.select().from(member).where(eq(member.userId, editor.user.id)))[0]!;

  await request("/api/organization/switch", {
    method: "POST",
    headers: { cookie: editor.cookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId }),
  });

  const res = await request(`/api/organization/members/${victimRow.id}`, {
    method: "PATCH",
    headers: { cookie: editor.cookie, "content-type": "application/json" },
    body: JSON.stringify({ role: "editor" }),
  });
  expect(res.status).toBe(403);

  const after = await db.select().from(member).where(eq(member.id, victimRow.id));
  expect(after[0]!.role).toBe("viewer");
  expect(editorRow.userId).toBe(editor.user.id);
});

it("removes a member and deletes the row", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const leaver = await signUp(uniqueEmail());
  await authFor(db).api.addMember({
    body: { userId: leaver.user.id, role: "editor", organizationId },
    headers: { cookie },
  });
  const row = (await db.select().from(member).where(eq(member.userId, leaver.user.id)))[0]!;

  const res = await request(`/api/organization/members/${row.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  expect(res.status).toBe(200);

  const after = await db.select().from(member).where(eq(member.id, row.id));
  expect(after).toHaveLength(0);
});

it("stores a display name on the member row, and reports it as the name this organization sees", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const saved = await request("/api/organization/member", {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ displayName: "Platform Lead" }),
  });
  expect(saved.status).toBe(200);

  const rows = await db
    .select()
    .from(member)
    .where(eq(member.organizationId, organizationId));
  expect(rows).toHaveLength(1);
  expect(rows[0]!.displayName).toBe("Platform Lead");

  const accounts = await db.select().from(user).where(eq(user.id, rows[0]!.userId));
  expect(accounts[0]!.name).not.toBe("Platform Lead");

  const me = await request("/api/me", { headers: { cookie } });
  const body = (await me.json()) as {
    user: { name: string };
    displayName: string | null;
  };
  expect(body.displayName).toBe("Platform Lead");
  expect(body.user.name).not.toBe("Platform Lead");
});

it("cancels a pending invitation and marks the row", async () => {
  const { cookie } = await ownerWithOrganization();
  const invited = uniqueEmail();
  await request("/api/organization/invitations", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ email: invited, role: "editor" }),
  });

  const row = (await db.select().from(invitation).where(eq(invitation.email, invited)))[0]!;

  const res = await request(`/api/organization/invitations/${row.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  expect(res.status).toBe(200);

  const after = await db.select().from(invitation).where(eq(invitation.id, row.id));
  expect(after[0]!.status).toBe("canceled");
});

it("refuses to cancel an invitation when the caller is not an owner", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const invited = uniqueEmail();
  await request("/api/organization/invitations", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ email: invited, role: "editor" }),
  });
  const row = (await db.select().from(invitation).where(eq(invitation.email, invited)))[0]!;

  const editor = await signUp(uniqueEmail());
  await authFor(db).api.addMember({
    body: { userId: editor.user.id, role: "editor", organizationId },
    headers: { cookie },
  });
  await request("/api/organization/switch", {
    method: "POST",
    headers: { cookie: editor.cookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId }),
  });

  const res = await request(`/api/organization/invitations/${row.id}`, {
    method: "DELETE",
    headers: { cookie: editor.cookie },
  });
  expect(res.status).toBe(403);

  const after = await db.select().from(invitation).where(eq(invitation.id, row.id));
  expect(after[0]!.status).toBe("pending");
});

it("keeps the owner in place when members are listed", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const res = await request("/api/organization/members", { headers: { cookie } });
  const body = (await res.json()) as { members: Array<{ role: string; isYou: boolean }> };
  expect(body.members).toHaveLength(1);
  expect(body.members[0]).toMatchObject({ role: "owner", isYou: true });
  const stillOwner = await db.select().from(member).where(eq(member.organizationId, organizationId));
  expect(stillOwner).toHaveLength(1);
  expect((await db.select().from(user)).length).toBeGreaterThan(0);
});

it("stores an avatar on the membership, not on the person", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  // Signed for the other way round: a path for a different organization, which
  // is what a client would have to send to point one organization's members at
  // another's image.
  const foreign = "avatars/00000000-0000-4000-8000-000000000000/whatever";
  const refused = await request("/api/organization/member/image", {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ image: foreign }),
  });
  expect(refused.status).toBe(400);

  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.organizationId, organizationId));
  const key = `avatars/${organizationId}/${membership!.id}`;
  const res = await request("/api/organization/member/image", {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ image: key }),
  });
  expect(res.status).toBe(200);

  // Read the row back rather than trusting the response.
  const [row] = await db
    .select({ image: member.image })
    .from(member)
    .where(eq(member.organizationId, organizationId));
  expect(row!.image).toBe(key);

  // No public base is configured in tests, so the read side falls back to
  // proxying the key through the API. With one, it is the bucket's base instead.
  const me = await request("/api/me", { headers: { cookie } });
  expect((await me.json()) as { image: string | null }).toMatchObject({
    image: `/api/images/${key}`,
  });
});
