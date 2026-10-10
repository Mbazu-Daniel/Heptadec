import { buildApp } from "../src/app";

export const app = buildApp();

export const PASSWORD = "supersecret1";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let seq = 0;

export const uniqueEmail = (): string =>
  `ada.lovelace.${Date.now()}.${seq++}@example.com`;

export const uniqueSlug = (): string =>
  `org-${Date.now()}-${seq++}`;
function sessionCookie(setCookie: string | null): string {
  const match = /better-auth\.session_token=[^;]+/.exec(setCookie ?? "");
  if (!match) {
    throw new Error(`sign-up returned no session cookie: ${setCookie}`);
  }
  return match[0];
}

export async function signUp(email: string) {
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
