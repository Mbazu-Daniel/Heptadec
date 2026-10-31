import {
  dataSourceStructure,
  localDatabase,
  type DataSourceStructureRow,
  type HeptadecDatabase,
} from "@heptadec/db";
import { eq } from "drizzle-orm";
import { buildApp } from "../src/app";
import { sweepStructure } from "../src/modules/schema/structure";

export const app = buildApp({ compressResponses: true });

export const db: HeptadecDatabase = localDatabase();

/**
 * A test's hand-off to the background. The task is started whether or not anyone
 * holds it, so this only keeps a failure off the process — and a test that needs a
 * structure sync to have landed runs the sweep itself, the way a scheduler tick
 * does, rather than guessing how long the background had.
 */
function waitUntil(task: Promise<unknown>): void {
  task.catch((caught: unknown) => {
    console.error("[test] background task failed:", caught);
  });
}

export const ENV = { db, waitUntil };

export function request(path: string, init?: RequestInit): Promise<Response> {
  return Promise.resolve(app.request(path, init, ENV));
}

/**
 * Run the background until it has reported on one source, and hand back the row it
 * wrote.
 *
 * The request that queued the sync already handed a read to the runtime, and that
 * read holds the lease while it works — so a test cannot simply sweep its way to
 * the answer, and the row is the only proof of what happened. Each pass sweeps the
 * way a scheduler tick would, then waits a little for whichever read holds the
 * lease. Other suites leave sources queued in the same table, which is why a tick
 * takes a few waiting sources and this one may not be first.
 */
const SYNC_DEADLINE_MS = 20_000;

const SYNC_WAIT_MS = 250;

export async function syncedStructure(
  dataSourceId: string,
): Promise<DataSourceStructureRow> {
  const deadline = Date.now() + SYNC_DEADLINE_MS;
  for (;;) {
    await sweepStructure(db, new Date());
    const rows = await db
      .select()
      .from(dataSourceStructure)
      .where(eq(dataSourceStructure.dataSourceId, dataSourceId))
      .limit(1);
    const row = rows[0];
    if (row === undefined) {
      throw new Error(`no structure was queued for ${dataSourceId}`);
    }
    if (row.payload !== null || row.error !== null) {
      return row;
    }
    if (Date.now() >= deadline) {
      throw new Error(`the background never reported on ${dataSourceId}`);
    }
    await new Promise((resolve) => setTimeout(resolve, SYNC_WAIT_MS));
  }
}

export const PASSWORD = "supersecret1";

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
