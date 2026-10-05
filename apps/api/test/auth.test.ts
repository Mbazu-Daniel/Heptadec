import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { db, schema } from "@heptadec/db";
import { buildApp } from "../src/app";

const { user, account, session } = schema;
const PASSWORD = "supersecret1";

const app = buildApp();

let seq = 0;
const uniqueEmail = (): string =>
  `ada.lovelace.${Date.now()}.${seq++}@example.com`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function sessionCookie(setCookie: string | null): string {
  const match = /better-auth\.session_token=[^;]+/.exec(setCookie ?? "");
  if (!match) {
    throw new Error(`sign-up returned no session cookie: ${setCookie}`);
  }
  return match[0];
}

async function signUp(email: string) {
  const res = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:8787",
    },
    body: JSON.stringify({ name: "SHOULD BE IGNORED", email, password: PASSWORD }),
  });
  if (res.status !== 200) {
    throw new Error(`sign-up failed (${res.status}): ${await res.text()}`);
  }
  const body = (await res.json()) as { user: { id: string; email: string } };
  return {
    user: body.user,
    cookie: sessionCookie(res.headers.get("set-cookie")),
  };
}

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
  expect(accounts[0]!.password).toMatch(/^\$argon2id\$/);
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

  const res = await app.request("/api/onboarding/complete", {
    method: "POST",
    headers: { cookie },
  });
  expect(res.status).toBe(200);

  const after = await db.select().from(user).where(eq(user.id, created.id));
  expect(after[0]!.onboardingCompleted).toBe(true);
});