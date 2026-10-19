import { createClient as createRedisClient } from "redis";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { db, request, signUp, STACK, TEST_POSTGRES, uniqueEmail, uniqueSlug } from "./helpers";

const { dataSource } = schema;

const TEST_REDIS = { ...STACK.redis, database: "0" };

async function ownerWithSource(readOnly: boolean): Promise<{
  cookie: string;
  id: string;
}> {
  const { cookie } = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Query Org", slug: uniqueSlug() },
    headers: { cookie },
  });

  const res = await request("/api/data-sources", {
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
  return request(`/api/data-sources/${id}/query`, {
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

it("caps a result at the row budget and marks it truncated", async () => {
  const { cookie, id } = await ownerWithSource(true);

  const res = await query(cookie, id, "SELECT generate_series(1, 10050) AS n");
  expect(res.status).toBe(200);

  const body = (await res.json()) as {
    rows: Array<Record<string, unknown>>;
    rowCount: number;
    truncated: boolean;
  };
  expect(body.rows).toHaveLength(10_000);
  expect(body.rowCount).toBe(10_000);
  expect(body.truncated).toBe(true);
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
  const org = await authFor(db).api.createOrganization({
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

function probeToken(): string {
  redisProbeSeq += 1;
  return `probe${Date.now().toString(36)}${redisProbeSeq}`;
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
  const org = await authFor(db).api.createOrganization({
    body: { name: "Redis Org", slug: uniqueSlug() },
    headers: { cookie },
  });

  const res = await request("/api/data-sources", {
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
  return request(`/api/data-sources/${id}/query`, {
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

it("runs a search over a quickwit index and answers with the documents it matched", async () => {
  const { cookie } = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Search Org", slug: uniqueSlug() },
    headers: { cookie },
  });

  const index = `events_${Date.now().toString(36)}`;
  const created = await fetch(`${STACK.quickwit.endpoint}/api/v1/indexes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      version: "0.8",
      index_id: index,
      doc_mapping: {
        field_mappings: [{ name: "event_name", type: "text", tokenizer: "default" }],
        store_source: true,
      },
      indexing_settings: {},
      search_settings: { default_search_fields: ["event_name"] },
    }),
  });
  expect(created.status).toBe(200);

  const probe = probeToken();
  const ingested = await fetch(
    `${STACK.quickwit.endpoint}/api/v1/${index}/ingest?commit=force`,
    {
      method: "POST",
      headers: { "content-type": "application/x-ndjson" },
      body: JSON.stringify({ event_name: probe, region: "eu-west-1" }),
    },
  );
  expect(ingested.status).toBe(200);

  const source = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "quickwit",
      name: "Seeded logs",
      endpoint: STACK.quickwit.endpoint,
      database: index,
    }),
  });
  expect(source.status).toBe(200);
  const stored = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, org.id));
  const id = stored[0]!.id;

  const res = await request(`/api/data-sources/${id}/query`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ search: { index, query: probe } }),
  });
  expect(res.status).toBe(200);

  const body = (await res.json()) as {
    columns: string[];
    rows: Array<Record<string, unknown>>;
    rowCount: number;
  };
  expect(body.columns).toEqual(["event_name", "region"]);
  expect(body.rows).toEqual([{ event_name: probe, region: "eu-west-1" }]);
  expect(body.rowCount).toBe(1);
});

it("refuses a search with no index and nothing is run", async () => {
  const { cookie } = await signUp(uniqueEmail());
  await authFor(db).api.createOrganization({
    body: { name: "Empty Search Org", slug: uniqueSlug() },
    headers: { cookie },
  });
  const source = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "quickwit",
      name: "No index",
      endpoint: STACK.quickwit.endpoint,
    }),
  });
  expect(source.status).toBe(200);
  const stored = await db.select().from(dataSource);
  const id = stored[stored.length - 1]!.id;

  const res = await request(`/api/data-sources/${id}/query`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ search: { query: "probe" } }),
  });
  expect(res.status).toBe(400);
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
