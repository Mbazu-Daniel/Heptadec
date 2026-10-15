import { and, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { PASSWORD, UUID, request, signUp, uniqueEmail, db } from "./helpers";

const { user, account, session } = schema;

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
      image: null,
    },
  });

  await db
    .delete(account)
    .where(and(eq(account.userId, created.id), eq(account.providerId, "credential")));

  const after = await request("/api/me", { headers: { cookie } });
  expect(((await after.json()) as { user: { hasPassword: boolean } }).user.hasPassword).toBe(false);
});

it("keeps the picture a member sets, and tells the profile page it is there", async () => {
  const { user: created, cookie } = await signUp(uniqueEmail());
  const picture = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

  const saved = await request("/api/auth/update-user", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ image: picture }),
  });
  expect(saved.status).toBe(200);

  const rows = await db.select().from(user).where(eq(user.id, created.id));
  expect(rows[0]!.image).toBe(picture);

  const me = await request("/api/me", { headers: { cookie } });
  expect(((await me.json()) as { user: { image: string } }).user.image).toBe(picture);
});
