import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { db, request, signUp, TEST_POSTGRES, uniqueEmail, uniqueSlug } from "./helpers";
import type { IExplainNode } from "../src/modules/query/contracts";

const { dataSource } = schema;

async function ownerWithSource(): Promise<{ cookie: string; id: string }> {
  const { cookie } = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Explain Org", slug: uniqueSlug() },
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
      readOnly: true,
    }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, org.id));
  return { cookie, id: rows[0]!.id };
}

function explain(cookie: string, id: string, sql: string): Promise<Response> | Response {
  return request(`/api/data-sources/${id}/explain`, {
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

function flatten(node: IExplainNode): IExplainNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

it("explains a real statement as a plan tree", async () => {
  const { cookie, id } = await ownerWithSource();

  const res = await explain(cookie, id, "SELECT id, event_name FROM events ORDER BY id");
  expect(res.status).toBe(200);

  const body = (await res.json()) as { plan: IExplainNode };
  const nodes = flatten(body.plan);
  expect(nodes[0]!.nodeType).toBe("Sort");
  expect(nodes.some((node) => node.nodeType === "Seq Scan")).toBe(true);

  const scan = nodes.find((node) => node.nodeType === "Seq Scan");
  expect(scan?.relationName).toBe("events");
  expect(typeof body.plan.totalCost).toBe("number");
  expect(typeof body.plan.planRows).toBe("number");
});

it("explains a write without running it", async () => {
  const before = await eventCount();
  const { cookie, id } = await ownerWithSource();

  const res = await explain(
    cookie,
    id,
    "INSERT INTO events(id,event_name,region) VALUES ('zzz','Injected','Nowhere')",
  );
  expect(res.status).toBe(200);
  expect(await eventCount()).toBe(before);
});

it("refuses a statement that is not one statement", async () => {
  const { cookie, id } = await ownerWithSource();

  const res = await explain(
    cookie,
    id,
    "SELECT 1 AS a; INSERT INTO events(id,event_name,region) VALUES ('zzy','Sneaky','Nowhere')",
  );
  expect(res.status).toBe(400);
});

it("404s an explanation for a source in another organization", async () => {
  const { id } = await ownerWithSource();
  const stranger = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Other Org", slug: uniqueSlug() },
    headers: { cookie: stranger.cookie },
  });
  expect(org.id).not.toBe("");

  const res = await explain(stranger.cookie, id, "SELECT 1 AS a");
  expect(res.status).toBe(404);
});
