import { expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  dataSource,
  dataSourceStructure,
  type DataSourceStructureRow,
} from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { encryptSecret } from "../src/modules/data-source/secret";
import { queueStructure } from "../src/modules/schema/structure";
import type { IStructureResponse } from "../src/modules/schema/contracts";
import {
  db,
  request,
  signUp,
  syncedStructure,
  TEST_POSTGRES,
  uniqueEmail,
  uniqueSlug,
} from "./helpers";

async function ownerWithSource(): Promise<{
  cookie: string;
  id: string;
  orgId: string;
}> {
  const { cookie } = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Structure Org", slug: uniqueSlug() },
    headers: { cookie },
  });

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Seeded shop",
      host: TEST_POSTGRES.host,
      port: TEST_POSTGRES.port,
      database: TEST_POSTGRES.database,
      username: TEST_POSTGRES.user,
      password: TEST_POSTGRES.password,
      readOnly: true,
    }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { dataSource: { id: string } };
  return { cookie, id: body.dataSource.id, orgId: org.id };
}

function rowsOf(id: string): Promise<DataSourceStructureRow[]> {
  return db
    .select()
    .from(dataSourceStructure)
    .where(eq(dataSourceStructure.dataSourceId, id));
}

/** The one structure row a source is expected to have — its absence is the failure. */
async function rowOf(id: string): Promise<DataSourceStructureRow> {
  const rows = await rowsOf(id);
  const row = rows[0];
  if (row === undefined) {
    throw new Error(`no structure row was kept for ${id}`);
  }
  return row;
}

it("queues a new source's structure inside its own organization", async () => {
  const { id, orgId } = await ownerWithSource();

  const rows = await db
    .select()
    .from(dataSourceStructure)
    .where(eq(dataSourceStructure.dataSourceId, id));

  // The hand-off to the background is already under way when the saved source is
  // answered, so the row is either still waiting its turn or already holds the
  // catalogue it read. What must never be true is a row in another organization,
  // a second row for one source, or a read that was never asked for.
  expect(rows).toHaveLength(1);
  const row = rows[0]!;
  expect(row.organizationId).toBe(orgId);
  expect(row.dataSourceId).toBe(id);
  expect(row.state === "ready" || row.state === "pending").toBe(true);
  expect(row.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());
});

it("keeps the structure it read when a source is put back in the queue", async () => {
  const { id } = await ownerWithSource();
  const read = await syncedStructure(id);
  expect(read.state).toBe("ready");
  expect(read.payload).not.toBeNull();

  const sources = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.id, id))
    .limit(1);

  // A caller whose hand-off goes nowhere: this is the queue row alone, which is
  // what editing a source looks like in the moment before the background answers.
  await queueStructure(db, sources[0]!, new Date(), () => {});

  const queued = await rowOf(id);
  expect(queued.state).toBe("pending");
  expect(queued.attempts).toBe(0);
  expect(queued.error).toBeNull();
  expect(queued.payload).toBe(read.payload);
});

it("answers a structure read from the store, not from the source", async () => {
  const { cookie, id } = await ownerWithSource();
  const stored = await syncedStructure(id);
  const tables = (
    JSON.parse(stored.payload!) as { schema: { tables: Array<{ name: string }> } }
  ).schema.tables.map((table) => table.name);
  expect(tables).toContain("products");

  // The source cannot be read any more — its sealed password no longer matches
  // anything — so the only place this answer can come from is what was stored.
  await db
    .update(dataSource)
    .set({ secret: await encryptSecret("wrong-on-purpose") })
    .where(eq(dataSource.id, id));

  const res = await request(`/api/data-sources/${id}/structure`, {
    headers: { cookie },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as IStructureResponse;
  expect(body.state).toBe("ready");
  expect(body.syncing).toBe(false);
  expect(body.tables.map((table) => table.name)).toEqual(tables);
});

it("removes what it stored when the source is removed", async () => {
  const { cookie, id } = await ownerWithSource();
  await syncedStructure(id);
  expect((await rowOf(id)).payload).not.toBeNull();

  const res = await request(`/api/data-sources/${id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  expect(res.status).toBe(200);
  expect(await rowsOf(id)).toHaveLength(0);
});
