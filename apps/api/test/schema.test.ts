import { expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { dataSourceStructure } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import {
  db,
  request,
  signUp,
  syncedStructure,
  STACK,
  TEST_POSTGRES,
  uniqueEmail,
  uniqueSlug,
} from "./helpers";
import type { IStructureResponse } from "../src/modules/schema/contracts";

async function ownerWithSource(kind = "postgres"): Promise<{
  cookie: string;
  id: string;
}> {
  const { cookie } = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Schema Org", slug: uniqueSlug() },
    headers: { cookie },
  });

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(
      kind === "postgres"
        ? {
            kind,
            name: "Seeded shop",
            host: TEST_POSTGRES.host,
            port: TEST_POSTGRES.port,
            database: TEST_POSTGRES.database,
            username: TEST_POSTGRES.user,
            password: TEST_POSTGRES.password,
            readOnly: true,
          }
        : { kind, name: "Seeded cache", ...STACK.redis },
    ),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { dataSource: { id: string } };
  return { cookie, id: body.dataSource.id };
}

/**
 * What the app reports about one source's structure, once the background has read
 * it — which is what every screen sees after the first tick.
 */
async function storedStructure(
  cookie: string,
  id: string,
): Promise<IStructureResponse> {
  await syncedStructure(id);
  return readStructure(cookie, id);
}

async function readStructure(
  cookie: string,
  id: string,
): Promise<IStructureResponse> {
  const response = await request(`/api/data-sources/${id}/structure`, {
    headers: { cookie },
  });
  expect(response.status).toBe(200);
  return (await response.json()) as IStructureResponse;
}

async function catalogueForeignKeys(): Promise<
  Array<{ constraint: string; from: string; to: string }>
> {
  const { default: pg } = await import("pg");
  const client = new pg.Client(TEST_POSTGRES);
  await client.connect();
  const res = await client.query<{
    constraint_name: string;
    from_table: string;
    to_table: string;
  }>(`
    select con.conname as constraint_name,
           src.relname as from_table,
           tgt.relname as to_table
    from pg_catalog.pg_constraint con
    join pg_catalog.pg_class src on src.oid = con.conrelid
    join pg_catalog.pg_namespace nsp on nsp.oid = src.relnamespace
    join pg_catalog.pg_class tgt on tgt.oid = con.confrelid
    where con.contype = 'f' and nsp.nspname = 'public'
    order by from_table
  `);
  await client.end();
  return res.rows.map((row) => ({
    constraint: row.constraint_name,
    from: row.from_table,
    to: row.to_table,
  }));
}

it("draws one line per foreign key the database actually declares", async () => {
  const { cookie, id } = await ownerWithSource();

  const body = await storedStructure(cookie, id);
  const declared = await catalogueForeignKeys();
  expect(body.relationships).toHaveLength(declared.length);
  expect(declared.length).toBeGreaterThan(0);

  expect(body.relationships.map((edge) => edge.constraint).sort()).toEqual(
    declared.map((edge) => edge.constraint).sort(),
  );
  for (const edge of body.relationships) {
    const match = declared.find((row) => row.constraint === edge.constraint);
    expect(edge.fromTable).toBe(match?.from);
    expect(edge.toTable).toBe(match?.to);
  }
});

it("reports the seeded tables with their columns and declared types", async () => {
  const { cookie, id } = await ownerWithSource();

  const body = await storedStructure(cookie, id);

  expect(body.sourceId).toBe(id);
  expect(body.database).toBe(TEST_POSTGRES.database);
  expect(body.stored).toBe(true);
  expect(body.state).toBe("ready");
  expect(body.stale).toBe(false);
  expect(body.syncedAt).not.toBeNull();

  const names = body.tables.map((table) => table.name).sort();
  expect(names).toContain("products");
  expect(names).toContain("order_items");
  expect(names).toContain("regions");

  const products = body.tables.find((table) => table.name === "products");
  const idColumn = products?.columns.find((column) => column.name === "id");
  expect(idColumn?.primaryKey).toBe(true);
  expect(idColumn?.nullable).toBe(false);
  const name = products?.columns.find((column) => column.name === "name");
  expect(name?.dataType).toBe("character varying(255)");

  const description = products?.columns.find(
    (column) => column.name === "description",
  );
  expect(description?.nullable).toBe(true);
});

it("keeps a foreign key's two endpoints pointing at real columns", async () => {
  const { cookie, id } = await ownerWithSource();

  const body = await storedStructure(cookie, id);
  const edge = body.relationships.find(
    (row) => row.fromTable === "order_items" && row.fromColumn === "product_id",
  );
  expect(edge).toBeDefined();
  expect(edge?.toTable).toBe("products");
  expect(edge?.toColumn).toBe("id");

  const orderItems = body.tables.find((table) => table.name === "order_items");
  expect(
    orderItems?.columns.find((column) => column.name === "product_id"),
  ).toBeDefined();
  expect(
    body.tables
      .find((table) => table.name === "products")
      ?.columns.find((column) => column.name === "id"),
  ).toBeDefined();
});

it("lists the indexes somebody wrote and not the one Postgres made for the key", async () => {
  const { cookie, id } = await ownerWithSource();

  const body = await storedStructure(cookie, id);
  const orderItems = body.tables.find((table) => table.name === "order_items");
  expect(orderItems?.indexedColumns).toContain("order_id");
  expect(orderItems?.indexedColumns).toContain("product_id");
  expect(orderItems?.indexedColumns).not.toContain("id");
});

it("reads the schema the source names, not the one it used to assume", async () => {
  const { cookie } = await signUp(uniqueEmail());
  await authFor(db).api.createOrganization({
    body: { name: "Schema Org", slug: uniqueSlug() },
    headers: { cookie },
  });

  const created = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Empty schema",
      host: TEST_POSTGRES.host,
      port: TEST_POSTGRES.port,
      database: TEST_POSTGRES.database,
      username: TEST_POSTGRES.user,
      password: TEST_POSTGRES.password,
      schema: "no_such_schema",
      readOnly: true,
    }),
  });
  const body = (await created.json()) as { dataSource: { id: string } };

  const found = await storedStructure(cookie, body.dataSource.id);
  expect(found.schemaName).toBe("no_such_schema");
  expect(found.tables).toHaveLength(0);
  expect(found.relationships).toHaveLength(0);
});

// A key space has no tables to keep, so the app reads it on the way in and says it
// stored nothing — which is also why its source card carries no structure state.
it("answers a key-space source live and keeps nothing of it", async () => {
  const { cookie, id } = await ownerWithSource("redis");

  const body = await readStructure(cookie, id);
  expect(body.stored).toBe(false);
  expect(body.tables).toHaveLength(0);

  const row = await db
    .select()
    .from(dataSourceStructure)
    .where(eq(dataSourceStructure.dataSourceId, id))
    .limit(1);
  expect(row[0]).toBeUndefined();
});

it("404s for a data source in another organization", async () => {
  const { id } = await ownerWithSource();
  const stranger = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Other Org", slug: uniqueSlug() },
    headers: { cookie: stranger.cookie },
  });
  expect(org.id).not.toBe("");

  const res = await request(`/api/data-sources/${id}/structure`, {
    headers: { cookie: stranger.cookie },
  });
  expect(res.status).toBe(404);
});

// What a refused source leaves behind is the reason, in the row and in the answer.
// The reason is written by the app's own sanitiser, so this is where a password
// would show up if it ever did.
it("does not leak the connection password when the database is unreachable", async () => {
  const { cookie } = await signUp(uniqueEmail());
  await authFor(db).api.createOrganization({
    body: { name: "Unreachable Org", slug: uniqueSlug() },
    headers: { cookie },
  });

  const created = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Nowhere",
      host: "127.0.0.1",
      port: 5499,
      database: "absent",
      username: "heptadec",
      password: "do-not-print-me",
      readOnly: true,
    }),
  });
  const body = (await created.json()) as { dataSource: { id: string } };
  const stored = await syncedStructure(body.dataSource.id);

  expect(stored.attempts).toBe(1);
  expect(stored.payload).toBeNull();
  expect(stored.error).not.toContain("do-not-print-me");
  expect(stored.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());

  const read = await request(`/api/data-sources/${body.dataSource.id}/structure`, {
    headers: { cookie },
  });
  expect(read.status).toBe(200);
  const reported = (await read.json()) as IStructureResponse;
  expect(reported.error).toBe(stored.error);
  expect(reported.tables).toHaveLength(0);
});
