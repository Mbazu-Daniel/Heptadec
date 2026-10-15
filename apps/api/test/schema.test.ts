import { expect, it } from "vitest";
import { authFor } from "../src/common/config/better-auth";
import { db, request, signUp, TEST_POSTGRES, uniqueEmail, uniqueSlug } from "./helpers";
import type { ISchemaResponse } from "../src/modules/schema/contracts";

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
        : { kind, name: "Seeded cache", host: "cache.internal", port: 6379 },
    ),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { dataSource: { id: string } };
  return { cookie, id: body.dataSource.id };
}

async function schemaResponse(
  cookie: string,
  id: string,
): Promise<Response> {
  return request(`/api/data-sources/${id}/schema`, {
    headers: { cookie },
  });
}

async function readSchema(cookie: string, id: string): Promise<ISchemaResponse> {
  const response = await schemaResponse(cookie, id);
  expect(response.status).toBe(200);
  return (await response.json()) as ISchemaResponse;
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

  const res = await schemaResponse(cookie, id);
  expect(res.status).toBe(200);
  const body = (await res.json()) as ISchemaResponse;
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

  const body = await readSchema(cookie, id);

  expect(body.database).toBe(TEST_POSTGRES.database);
  expect(body.sourceId).toBe(id);

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

  const body = await readSchema(cookie, id);
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

  const body = await readSchema(cookie, id);
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

  const read = await schemaResponse(cookie, body.dataSource.id);
  expect(read.status).toBe(200);
  const found = (await read.json()) as ISchemaResponse;
  expect(found.schemaName).toBe("no_such_schema");
  expect(found.tables).toHaveLength(0);
  expect(found.relationships).toHaveLength(0);
});

it("refuses a source that is not postgres and names the engine", async () => {
  const { cookie, id } = await ownerWithSource("redis");

  const res = await schemaResponse(cookie, id);
  expect(res.status).toBe(400);
  expect(await res.text()).toContain("redis");
});

it("404s for a data source in another organization", async () => {
  const { id } = await ownerWithSource();
  const stranger = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Other Org", slug: uniqueSlug() },
    headers: { cookie: stranger.cookie },
  });
  expect(org.id).not.toBe("");

  const res = await schemaResponse(stranger.cookie, id);
  expect(res.status).toBe(404);
});

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

  const res = await schemaResponse(cookie, body.dataSource.id);
  expect(res.status).toBe(400);
  const text = await res.text();
  expect(text).not.toContain("do-not-print-me");
});
