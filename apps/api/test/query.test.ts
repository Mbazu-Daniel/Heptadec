import { createClient as createRedisClient } from "redis";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { db, schema } from "@heptadec/db";
import { auth } from "../src/common/config/better-auth";
import { app, signUp, uniqueEmail, uniqueSlug } from "./helpers";

const { dataSource } = schema;

const TEST_POSTGRES = {
  host: "127.0.0.1",
  port: 5434,
  user: "heptadec",
  password: "heptadec",
  database: "heptadec_test",
};

const TEST_REDIS = { host: "127.0.0.1", port: 6381, database: "0" };

async function ownerWithSource(readOnly: boolean): Promise<{
  cookie: string;
  id: string;
}> {
  const { cookie } = await signUp(uniqueEmail());
  const org = await auth.api.createOrganization({
    body: { name: "Query Org", slug: uniqueSlug() },
    headers: { cookie },
  });

  const res = await app.request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Seeded events",
      host: TEST_POSTGRES.host,
      port: TEST_POSTGRES.port,
      database: TEST_POSTGRES.database,
      username: TEST_POSTGRES.user,
      password: TEST_POSTGRES.password,
      readOnly,
    }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, org.id));
  expect(rows).toHaveLength(1);
  return { cookie, id: rows[0]!.id };
}

async function query(
  cookie: string,
  id: string,
  sql: string,
): Promise<Response> {
  return app.request(`/api/data-sources/${id}/query`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ sql }),
  });
}

async function eventCount(): Promise<number> {
  const { default: pg } = await import("pg");
  const client = new pg.Client(TEST_POSTGRES);
  await client.connect();
  const res = await client.query("SELECT count(*)::int AS n FROM events");
  await client.end();
  return res.rows[0].n as number;
}

it("returns real rows from the seeded postgres", async () => {
  const { cookie, id } = await ownerWithSource(true);

  const res = await query(
    cookie,
    id,
    "SELECT id, event_name, region FROM events ORDER BY id",
  );
  expect(res.status).toBe(200);

  const body = (await res.json()) as {
    columns: string[];
    columnTypes: string[];
    rows: Array<Record<string, unknown>>;
    rowCount: number;
    durationMs: number;
  };
  expect(body.columns).toEqual(["id", "event_name", "region"]);
  expect(body.columnTypes).toEqual(["text", "text", "text"]);
  expect(body.rowCount).toBeGreaterThan(0);
  expect(body.rows[0]).toHaveProperty("event_name");
  expect(typeof body.durationMs).toBe("number");
});

it("refuses a write on a read-only source and leaves the row count unchanged", async () => {
  const before = await eventCount();
  const { cookie, id } = await ownerWithSource(true);

  const res = await query(
    cookie,
    id,
    "INSERT INTO events(id,event_name,region) VALUES (901,'Injected','Nowhere')",
  );
  expect(res.status).toBe(400);

  expect(await eventCount()).toBe(before);
});

it("refuses a second command smuggled into one request", async () => {
  const before = await eventCount();
  const { cookie, id } = await ownerWithSource(true);

  const res = await query(
    cookie,
    id,
    "SELECT 1 AS a; INSERT INTO events(id,event_name,region) VALUES (902,'Sneaky','Nowhere')",
  );
  expect(res.status).toBe(400);

  expect(await eventCount()).toBe(before);
});

it("reports a missing table without echoing the password", async () => {
  const { cookie, id } = await ownerWithSource(true);

  const res = await query(cookie, id, "SELECT * FROM no_such_table");
  expect(res.status).toBeGreaterThanOrEqual(400);

  const text = await res.text();
  expect(text).not.toContain(TEST_POSTGRES.password);
});

it("404s for a data source in another organization", async () => {
  const { id } = await ownerWithSource(true);
  const stranger = await signUp(uniqueEmail());
  const org = await auth.api.createOrganization({
    body: { name: "Other Org", slug: uniqueSlug() },
    headers: { cookie: stranger.cookie },
  });
  expect(org.id).not.toBe("");

  const res = await query(
    stranger.cookie,
    id,
    "SELECT 1 AS a",
  );
  expect(res.status).toBe(404);
});

let redisProbeSeq = 0;

function probeKey(): string {
  redisProbeSeq += 1;
  return `heptadec:query:${Date.now().toString(36)}:${redisProbeSeq}`;
}

function redisDirect() {
  return createRedisClient({ url: `redis://${TEST_REDIS.host}:${TEST_REDIS.port}` });
}

async function withRedis<T>(
  use: (client: ReturnType<typeof redisDirect>) => Promise<T>,
): Promise<T> {
  const client = redisDirect();
  await client.connect();
  try {
    return await use(client);
  } finally {
    await client.quit().catch(() => undefined);
  }
}

async function ownerWithRedisSource(): Promise<{ cookie: string; id: string }> {
  const { cookie } = await signUp(uniqueEmail());
  const org = await auth.api.createOrganization({
    body: { name: "Redis Org", slug: uniqueSlug() },
    headers: { cookie },
  });

  const res = await app.request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "redis",
      name: "Seeded cache",
      host: TEST_REDIS.host,
      port: TEST_REDIS.port,
      database: TEST_REDIS.database,
    }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, org.id));
  expect(rows).toHaveLength(1);
  return { cookie, id: rows[0]!.id };
}

async function runCommand(
  cookie: string,
  id: string,
  command: string,
): Promise<Response> {
  return app.request(`/api/data-sources/${id}/query`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ command }),
  });
}

it("runs a read command against the seeded redis and returns the hash as rows", async () => {
  const { cookie, id } = await ownerWithRedisSource();
  const key = probeKey();
  await withRedis((client) => client.hSet(key, { event_name: "probe", region: "eu-west-1" }));

  const res = await runCommand(cookie, id, `HGETALL ${key}`);
  expect(res.status).toBe(200);

  const body = (await res.json()) as {
    columns: string[];
    rows: Array<Record<string, unknown>>;
    durationMs: number;
  };
  expect(body.columns).toEqual(["field", "value"]);
  expect(body.rows).toContainEqual({ field: "event_name", value: "probe" });
  expect(typeof body.durationMs).toBe("number");
});

it("reads a scalar with GET and the key's type with TYPE", async () => {
  const { cookie, id } = await ownerWithRedisSource();
  const key = probeKey();
  await withRedis((client) => client.set(key, "cache-me"));

  const read = await runCommand(cookie, id, `GET ${key}`);
  expect(read.status).toBe(200);
  const readBody = (await read.json()) as { rows: Array<Record<string, unknown>> };
  expect(readBody.rows).toEqual([{ value: "cache-me" }]);

  const typed = await runCommand(cookie, id, `TYPE ${key}`);
  expect(typed.status).toBe(200);
  const typeBody = (await typed.json()) as { rows: Array<Record<string, unknown>> };
  expect(typeBody.rows).toEqual([{ value: "string" }]);
});

it("refuses SET and nothing is written to redis", async () => {
  const { cookie, id } = await ownerWithRedisSource();
  const key = probeKey();

  const res = await runCommand(cookie, id, `SET ${key} injected`);
  expect(res.status).toBe(400);

  expect(await withRedis((client) => client.exists(key))).toBe(0);
});

it("refuses DEL and the key it names survives with its fields", async () => {
  const { cookie, id } = await ownerWithRedisSource();
  const key = probeKey();
  await withRedis((client) => client.hSet(key, { event_name: "keep-me" }));

  const res = await runCommand(cookie, id, `DEL ${key}`);
  expect(res.status).toBe(400);

  expect(await withRedis((client) => client.hGet(key, "event_name"))).toBe("keep-me");
});

it("refuses the writes that sit next to reads, and the seeded keys survive", async () => {
  const { cookie, id } = await ownerWithRedisSource();
  const key = probeKey();
  await withRedis((client) => client.hSet(key, { event_name: "keep-me" }));

  for (const command of [
    `GETSET ${key} injected`,
    `PERSIST ${key}`,
    "FLUSHALL",
    "CONFIG SET maxmemory 1mb",
    "set injected",
  ]) {
    const res = await runCommand(cookie, id, command);
    expect(res.status, command).toBe(400);
  }
  expect(await withRedis((client) => client.hGet(key, "event_name"))).toBe("keep-me");
});
