import { localDatabase, type HeptadecDatabase } from "@heptadec/db";
import { buildApp } from "../src/app";

export const app = buildApp();

export const db: HeptadecDatabase = localDatabase();

export function request(path: string, init?: RequestInit): Promise<Response> {
  return Promise.resolve(app.request(path, init, { db }));
}

export const PASSWORD = "supersecret1";

/**
 * The Postgres the test stack exposes. Its host port is read from the
 * environment because 5434 is commonly already taken by another project on a
 * shared machine — docker-compose.test.override.yml maps it to match.
 */
export const TEST_POSTGRES_PORT = Number(
  process.env.HEPTADEC_TEST_POSTGRES_PORT ?? 5434,
);

export const TEST_POSTGRES = {
  host: "127.0.0.1",
  port: TEST_POSTGRES_PORT,
  user: "heptadec",
  password: "heptadec",
  database: "heptadec_test",
};

/**
 * Every engine the test stack exposes, by the credentials a source needs to
 * reach it. One place, so a test that talks to an engine says which engine it
 * means rather than repeating a port and hoping it is the right one.
 */
export const STACK = {
  postgres: { ...TEST_POSTGRES, username: "heptadec" },
  mysql: {
    host: "127.0.0.1",
    port: 3308,
    database: "heptadec_test",
    username: "heptadec",
    password: "Delta1force",
  },
  mariadb: {
    host: "127.0.0.1",
    port: 3309,
    database: "heptadec_test",
    username: "heptadec",
    password: "Delta1force",
  },
  redis: { host: "127.0.0.1", port: 6381 },
  clickhouse: {
    host: "127.0.0.1",
    port: 8124,
    database: "heptadec_test",
    username: "heptadec",
    password: "Delta1force",
  },
  libsql: { endpoint: "http://127.0.0.1:8081" },
  mongo: { host: "127.0.0.1", port: 27018 },
  quickwit: { endpoint: "http://127.0.0.1:7282" },
} as const;

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
  const res = await request("/api/auth/sign-up/email", {
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
