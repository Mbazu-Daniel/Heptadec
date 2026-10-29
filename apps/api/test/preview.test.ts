import { Client as PgClient } from "pg";
import { createConnection as createMysqlConnection } from "mysql2/promise";
import { createClient as createRedisClient } from "redis";
import { createClient as createClickhouseClient } from "@clickhouse/client-web";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { authFor } from "../src/common/config/better-auth";
import type { IPreviewObject } from "../src/modules/data-source/contracts";
import {
  db,
  request,
  signUp,
  STACK,
  syncedStructure,
  uniqueEmail,
  uniqueSlug,
} from "./helpers";

let probeSeq = 0;

function probeId(): string {
  probeSeq += 1;
  return `probe${Date.now().toString(36)}${probeSeq}`;
}

async function ownerWithOrganization(): Promise<{
  cookie: string;
  organizationId: string;
}> {
  const { cookie } = await signUp(uniqueEmail());
  const created = await authFor(db).api.createOrganization({
    body: { name: "Preview Org", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, organizationId: created.id };
}

async function createSource(
  cookie: string,
  input: Record<string, unknown>,
): Promise<string> {
  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { dataSource: { id: string } };
  return body.dataSource.id;
}

/**
 * What the app serves as a source's catalogue. A structure-keeping engine answers
 * from the store, so a test that wants the tables has to let the sync land first;
 * a key space or an index list is read live, as it always was.
 */
async function objectsOf(
  cookie: string,
  dataSourceId: string,
): Promise<IPreviewObject[]> {
  const res = await request(`/api/data-sources/${dataSourceId}/structure`, {
    headers: { cookie },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { objects: IPreviewObject[] };
  return body.objects;
}

async function pgCount(): Promise<number> {
  const client = new PgClient({
    host: STACK.postgres.host,
    port: STACK.postgres.port,
    database: STACK.postgres.database,
    user: STACK.postgres.username,
    password: STACK.postgres.password,
    statement_timeout: 10000,
  });
  await client.connect();
  try {
    const result = await client.query("SELECT count(*)::int AS n FROM public.events");
    return (result.rows[0] as { n: number }).n;
  } finally {
    await client.end().catch(() => undefined);
  }
}

it("lists postgres tables and previews the rows inside", async () => {
  const { cookie } = await ownerWithOrganization();
  const probe = probeId();
  const direct = new PgClient({
    host: STACK.postgres.host,
    port: STACK.postgres.port,
    database: STACK.postgres.database,
    user: STACK.postgres.username,
    password: STACK.postgres.password,
    statement_timeout: 10000,
  });
  await direct.connect();
  await direct.query("INSERT INTO public.events (id, event_name, region) VALUES ($1, 'probe', 'eu-west-1')", [probe]);
  await direct.end().catch(() => undefined);

  const id = await createSource(cookie, {
    kind: "postgres",
    name: "Preview pg",
    host: STACK.postgres.host,
    port: STACK.postgres.port,
    database: STACK.postgres.database,
    username: STACK.postgres.username,
    password: STACK.postgres.password,
  });

  await syncedStructure(id);
  expect(await objectsOf(cookie, id)).toContainEqual({
    name: "public.events",
    type: "table",
  });

  const previewed = await request(`/api/data-sources/${id}/preview`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ object: "public.events", limit: 100 }),
  });
  expect(previewed.status).toBe(200);
  const previewBody = (await previewed.json()) as {
    columns: string[];
    rows: { id: string }[];
    truncated: boolean;
  };
  expect(previewBody.columns).toEqual(
    expect.arrayContaining(["id", "event_name", "region"]),
  );
  expect(previewBody.rows.map((row) => row.id)).toContain(probe);
});

it("refuses a preview for an object that is not listed, and the table survives", async () => {
  const { cookie } = await ownerWithOrganization();
  const id = await createSource(cookie, {
    kind: "postgres",
    name: "Guarded pg",
    host: STACK.postgres.host,
    port: STACK.postgres.port,
    database: STACK.postgres.database,
    username: STACK.postgres.username,
    password: STACK.postgres.password,
  });

  await syncedStructure(id);
  const before = await pgCount();
  const res = await request(`/api/data-sources/${id}/preview`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ object: "events; DROP TABLE events--" }),
  });
  expect(res.status).toBe(404);
  expect(await pgCount()).toBe(before);
});

it("refuses a preview limit outside 1 to 100", async () => {
  const { cookie } = await ownerWithOrganization();
  const id = await createSource(cookie, {
    kind: "postgres",
    name: "Capped pg",
    host: STACK.postgres.host,
    port: STACK.postgres.port,
    database: STACK.postgres.database,
    username: STACK.postgres.username,
    password: STACK.postgres.password,
  });

  const res = await request(`/api/data-sources/${id}/preview`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ object: "public.events", limit: 500 }),
  });
  expect(res.status).toBe(400);
});

it("refuses browsing to a viewer", async () => {
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

  const res = await request("/api/data-sources/00000000-0000-4000-8000-000000000000/structure", {
    headers: { cookie: viewerCookie },
  });
  expect(res.status).toBe(403);
});

it("returns 404 when browsing another organization's source", async () => {
  const mine = await ownerWithOrganization();
  const theirs = await ownerWithOrganization();
  const id = await createSource(theirs.cookie, {
    kind: "postgres",
    name: "Their pg",
    host: STACK.postgres.host,
    port: STACK.postgres.port,
    database: STACK.postgres.database,
    username: STACK.postgres.username,
    password: STACK.postgres.password,
  });

  const res = await request(`/api/data-sources/${id}/structure`, {
    headers: { cookie: mine.cookie },
  });
  expect(res.status).toBe(404);
});

it("lists redis keys and previews a hash", async () => {
  const { cookie } = await ownerWithOrganization();
  const probe = probeId();
  const direct = createRedisClient({
    url: `redis://${STACK.redis.host}:${STACK.redis.port}`,
  });
  await direct.connect();
  await direct.hSet(`event:${probe}`, { event_name: "probe", region: "eu-west-1" });
  await direct.quit().catch(() => undefined);

  const id = await createSource(cookie, {
    kind: "redis",
    name: "Preview cache",
    host: STACK.redis.host,
    port: STACK.redis.port,
  });

  expect(await objectsOf(cookie, id)).toContainEqual({
    name: `event:${probe}`,
    type: "key",
  });

  const previewed = await request(`/api/data-sources/${id}/preview`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ object: `event:${probe}` }),
  });
  expect(previewed.status).toBe(200);
  const previewBody = (await previewed.json()) as {
    columns: string[];
    rows: { field: string; value: string }[];
  };
  expect(previewBody.columns).toEqual(["field", "value"]);
  expect(previewBody.rows).toContainEqual({ field: "event_name", value: "probe" });
});

it("searches a quickwit index for the ingested probe", async () => {
  const { cookie } = await ownerWithOrganization();
  const probe = probeId();
  await fetch(`${STACK.quickwit.endpoint}/api/v1/indexes/events`, {
    method: "DELETE",
  }).catch(() => undefined);
  const created = await fetch(`${STACK.quickwit.endpoint}/api/v1/indexes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      version: "0.8",
      index_id: "events",
      doc_mapping: {
        field_mappings: [
          { name: "id", type: "text", tokenizer: "raw" },
          { name: "event_name", type: "text", tokenizer: "default" },
          { name: "region", type: "text", tokenizer: "raw" },
        ],
        store_source: true,
      },
      indexing_settings: {},
      search_settings: { default_search_fields: ["event_name"] },
    }),
  });
  expect(created.status).toBe(200);
  const ingested = await fetch(
    `${STACK.quickwit.endpoint}/api/v1/events/ingest?commit=force`,
    {
      method: "POST",
      headers: { "content-type": "application/x-ndjson" },
      body: JSON.stringify({ id: probe, event_name: "probe", region: "eu-west-1" }),
    },
  );
  expect(ingested.status).toBe(200);

  const id = await createSource(cookie, {
    kind: "quickwit",
    name: "Preview logs",
    endpoint: STACK.quickwit.endpoint,
    database: "events",
  });

  expect(await objectsOf(cookie, id)).toContainEqual({
    name: "events",
    type: "index",
  });

  const previewed = await request(`/api/data-sources/${id}/preview`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ object: "events", query: `id:${probe}` }),
  });
  expect(previewed.status).toBe(200);
  const previewBody = (await previewed.json()) as {
    rows: { id: string }[];
  };
  expect(previewBody.rows.map((row) => row.id)).toContain(probe);
});

it("previews mysql and mariadb tables through the same path", async () => {
  const { cookie } = await ownerWithOrganization();
  for (const engine of [STACK.mysql, STACK.mariadb] as const) {
    const probe = probeId();
    const direct = await createMysqlConnection({
      host: engine.host,
      port: engine.port,
      database: engine.database,
      user: engine.username,
      password: engine.password,
      connectTimeout: 10000,
    });
    await direct.query("INSERT INTO events (id, event_name, region) VALUES (?, 'probe', 'eu-west-1')", [probe]);
    await direct.end().catch(() => undefined);

    const id = await createSource(cookie, {
      kind: engine === STACK.mysql ? "mysql" : "mariadb",
      name: "Preview mysql-family",
      host: engine.host,
      port: engine.port,
      database: engine.database,
      username: engine.username,
      password: engine.password,
    });

    await syncedStructure(id);
    const previewed = await request(`/api/data-sources/${id}/preview`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ object: "events" }),
    });
    expect(previewed.status).toBe(200);
    const previewBody = (await previewed.json()) as {
      rows: { id: string }[];
    };
    expect(previewBody.rows.map((row) => row.id)).toContain(probe);
  }
});

it("previews a clickhouse table", async () => {
  const { cookie } = await ownerWithOrganization();
  const probe = probeId();
  const direct = createClickhouseClient({
    url: `http://${STACK.clickhouse.host}:${STACK.clickhouse.port}`,
    username: STACK.clickhouse.username,
    password: STACK.clickhouse.password,
    database: STACK.clickhouse.database,
  });
  await direct.insert({
    table: "events",
    values: [{ id: probe, event_name: "probe", region: "eu-west-1" }],
    format: "JSONEachRow",
  });
  await direct.close().catch(() => undefined);

  const id = await createSource(cookie, {
    kind: "clickhouse",
    name: "Preview olap",
    host: STACK.clickhouse.host,
    port: STACK.clickhouse.port,
    database: STACK.clickhouse.database,
    username: STACK.clickhouse.username,
    password: STACK.clickhouse.password,
  });

  await syncedStructure(id);
  const previewed = await request(`/api/data-sources/${id}/preview`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ object: "events" }),
  });
  expect(previewed.status).toBe(200);
  const previewBody = (await previewed.json()) as {
    rows: { id: string }[];
  };
  expect(previewBody.rows.map((row) => row.id)).toContain(probe);
});

it("previews a local sqlite file", async () => {
  const { cookie } = await ownerWithOrganization();
  const probe = probeId();
  const filePath = join(tmpdir(), `heptadec-preview-${Date.now()}.db`);
  const direct = new DatabaseSync(filePath);
  direct.exec(
    `CREATE TABLE events (id TEXT PRIMARY KEY, event_name TEXT, region TEXT); INSERT INTO events VALUES ('${probe}', 'probe', 'eu-west-1');`,
  );
  direct.close();

  const id = await createSource(cookie, {
    kind: "sqlite",
    name: "Preview file",
    filePath,
  });

  await syncedStructure(id);
  const previewed = await request(`/api/data-sources/${id}/preview`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ object: "events" }),
  });
  expect(previewed.status).toBe(200);
  const previewBody = (await previewed.json()) as {
    rows: { id: string }[];
  };
  expect(previewBody.rows.map((row) => row.id)).toContain(probe);
});

it("previews a libsql table over http", async () => {
  const { cookie } = await ownerWithOrganization();
  const probe = probeId();
  const seeded = await fetch(`${STACK.libsql.endpoint}/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      statements: [
        "CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, event_name TEXT, region TEXT)",
        `INSERT INTO events VALUES ('${probe}', 'probe', 'eu-west-1')`,
      ],
    }),
  });
  expect(seeded.status).toBe(200);

  const id = await createSource(cookie, {
    kind: "libsql",
    name: "Preview edge",
    endpoint: STACK.libsql.endpoint,
  });

  await syncedStructure(id);
  const previewed = await request(`/api/data-sources/${id}/preview`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ object: "events" }),
  });
  expect(previewed.status).toBe(200);
  const previewBody = (await previewed.json()) as {
    rows: { id: string }[];
  };
  expect(previewBody.rows.map((row) => row.id)).toContain(probe);
});
