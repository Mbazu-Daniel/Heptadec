import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import {
  PASSWORD,
  UUID,
  request,
  signUp,
  uniqueEmail,
  uniqueSlug,
  db,
} from "./helpers";

const { user, account, session, member } = schema;

it("stores the user, the hashed credential, and the session in the database", async () => {
  const email = uniqueEmail();
  const { user: created } = await signUp(email);

  const users = await db.select().from(user).where(eq(user.id, created.id));
  expect(users).toHaveLength(1);
  expect(users[0]).toMatchObject({ id: created.id, email });

  expect(users[0]!.name).toMatch(/^Ada Lovelace$/);
  expect(users[0]!.id).toMatch(UUID);

  expect(users[0]!.onboardingCompleted).toBe(false);

  const accounts = await db
    .select()
    .from(account)
    .where(eq(account.userId, created.id));
  expect(accounts).toHaveLength(1);
  expect(accounts[0]!.password).toMatch(/^\$pbkdf2-sha256\$/);
  expect(accounts[0]!.password).not.toContain(PASSWORD);

  const sessions = await db
    .select()
    .from(session)
    .where(eq(session.userId, created.id));
  expect(sessions).toHaveLength(1);
});

it("flips onboarding_completed in the database when onboarding finishes", async () => {
  const { user: created, cookie } = await signUp(uniqueEmail());

  const before = await db.select().from(user).where(eq(user.id, created.id));
  expect(before[0]!.onboardingCompleted).toBe(false);

  const res = await request("/api/onboarding/complete", {
    method: "POST",
    headers: { cookie },
  });
  expect(res.status).toBe(200);

  const after = await db.select().from(user).where(eq(user.id, created.id));
  expect(after[0]!.onboardingCompleted).toBe(true);
});

it("reports the profile fields the settings page needs", async () => {
  const { user: created, cookie } = await signUp(uniqueEmail());

  const before = await request("/api/me", { headers: { cookie } });
  expect((await before.json()) as unknown).toMatchObject({
    user: {
      id: created.id,
      hasPassword: true,
    },
    displayName: null,
    image: null,
  });

  await db
    .delete(account)
    .where(and(eq(account.userId, created.id), eq(account.providerId, "credential")));

  const after = await request("/api/me", { headers: { cookie } });
  expect(((await after.json()) as { user: { hasPassword: boolean } }).user.hasPassword).toBe(false);
});

it("keeps the picture a member sets, and tells the profile page it is there", async () => {
  const email = uniqueEmail();
  const { cookie } = await signUp(email);
  const created = await authFor(db).api.createOrganization({
    body: { name: "Aperture", slug: uniqueSlug() },
    headers: { cookie },
  });
  const organizationId = created.id;

  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(eq(member.organizationId, organizationId));
  const path = `/api/images/avatars/${organizationId}/${membership!.id}`;

  const saved = await request("/api/organization/member/image", {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ image: path }),
  });
  expect(saved.status).toBe(200);

  const [row] = await db
    .select({ image: member.image })
    .from(member)
    .where(eq(member.organizationId, organizationId));
  expect(row!.image).toBe(path);

  // The member's avatar and the person's own image are separate facts. Writing
  // one must not touch the other, so the user's image is still empty afterwards.
  const me = await request("/api/me", { headers: { cookie } });
  const body = (await me.json()) as { image: string | null; user: { image: string | null } };
  expect(body.image).toBe(path);
  expect(body.user.image).toBe(null);

  const [person] = await db
    .select({ image: user.image })
    .from(user)
    .where(eq(user.email, email));
  expect(person!.image ?? null).toBe(null);
});
