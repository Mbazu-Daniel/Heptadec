import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { db, request, signUp, TEST_POSTGRES, uniqueEmail, uniqueSlug } from "./helpers";

const { dashboard, dataSource, queryResult, savedQuery, widget } = schema;

const REGION_COUNTS =
  "SELECT region, count(*)::int AS events FROM events GROUP BY region ORDER BY region";

const REGION_POINTS = [
  { label: "ap-south-1", value: 1 },
  { label: "eu-west-1", value: 2 },
  { label: "us-east-1", value: 1 },
];

async function regionCounts(): Promise<Array<{ label: string; value: number }>> {
  const { default: pg } = await import("pg");
  const client = new pg.Client(TEST_POSTGRES);
  await client.connect();
  const res = await client.query(
    "SELECT region, count(*)::int AS events FROM events GROUP BY region ORDER BY region",
  );
  await client.end();
  return res.rows.map((row) => ({
    label: row.region as string,
    value: row.events as number,
  }));
}

async function ownerWithOrg(): Promise<{ cookie: string; orgId: string }> {
  const { cookie } = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Charts Org", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, orgId: org.id };
}

async function ownerWithSource(): Promise<{
  cookie: string;
  orgId: string;
  sourceId: string;
}> {
  const { cookie, orgId } = await ownerWithOrg();

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
    .where(eq(dataSource.organizationId, orgId));
  return { cookie, orgId, sourceId: rows[0]!.id };
}

async function createDashboard(
  cookie: string,
  name: string,
  dataSourceIds: string[],
): Promise<string> {
  const res = await request("/api/dashboards", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name, dataSourceIds }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { dashboard: { id: string } };
  return body.dashboard.id;
}

async function saveRegionCounts(cookie: string, sourceId: string): Promise<string> {
  const res = await request(`/api/data-sources/${sourceId}/saved-queries`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Events per region", sql: REGION_COUNTS }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { savedQuery: { id: string } };
  return body.savedQuery.id;
}

async function chartIt(
  cookie: string,
  dashboardId: string,
  fields: Record<string, unknown>,
): Promise<Response> {
  return request(`/api/dashboards/${dashboardId}/widgets`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(fields),
  });
}

it("persists a dashboard and the chart placed on it", async () => {
  const { cookie, orgId, sourceId } = await ownerWithSource();
  const dashboardId = await createDashboard(cookie, "Ops overview", [sourceId]);
  const savedQueryId = await saveRegionCounts(cookie, sourceId);

  const res = await chartIt(cookie, dashboardId, {
    savedQueryId,
    chartType: "bar",
    title: "Events per region",
    labelColumn: "region",
    valueColumn: "events",
  });
  expect(res.status).toBe(201);

  const dashboards = await db
    .select()
    .from(dashboard)
    .where(eq(dashboard.organizationId, orgId));
  expect(dashboards).toHaveLength(1);
  expect(dashboards[0]!.name).toBe("Ops overview");

  const widgets = await db
    .select()
    .from(widget)
    .where(eq(widget.dashboardId, dashboardId));
  expect(widgets).toHaveLength(1);
  expect(widgets[0]!.chartType).toBe("bar");
  expect(widgets[0]!.labelColumn).toBe("region");
  expect(widgets[0]!.valueColumn).toBe("events");
  expect(widgets[0]!.savedQueryId).toBe(savedQueryId);
  const queries = await db
    .select()
    .from(savedQuery)
    .where(eq(savedQuery.id, savedQueryId));
  expect(queries[0]!.sql).toBe(REGION_COUNTS);
});

it("plots a chart from the cached result of its last run", async () => {
  const { cookie, sourceId } = await ownerWithSource();
  const dashboardId = await createDashboard(cookie, "Ops overview", [sourceId]);
  const savedQueryId = await saveRegionCounts(cookie, sourceId);

  const created = await chartIt(cookie, dashboardId, {
    savedQueryId,
    chartType: "bar",
    title: "Events per region",
    labelColumn: "region",
    valueColumn: "events",
  });
  const { widget: placed } = (await created.json()) as { widget: { id: string } };
  const cold = await request(`/api/widgets/${placed.id}/data`, {
    headers: { cookie },
  });
  expect(cold.status).toBe(200);
  const coldBody = (await cold.json()) as {
    points: unknown[];
    ranAt: string | null;
    stale: boolean;
  };
  expect(coldBody.points).toEqual([]);
  expect(coldBody.ranAt).toBeNull();
  const refreshed = await request(`/api/widgets/${placed.id}/refresh`, {
    method: "POST",
    headers: { cookie },
  });
  expect(refreshed.status).toBe(200);

  const cache = await db
    .select()
    .from(queryResult)
    .where(eq(queryResult.savedQueryId, savedQueryId));
  expect(cache).toHaveLength(1);
  const grid = JSON.parse(cache[0]!.payload) as { rowCount: number };
  expect(grid.rowCount).toBeGreaterThan(0);

  const res = await request(`/api/widgets/${placed.id}/data`, {
    headers: { cookie },
  });
  expect(res.status).toBe(200);

  const body = (await res.json()) as {
    points: Array<{ label: string; value: number }>;
    rowCount: number;
    durationMs: number;
    ranAt: string | null;
    stale: boolean;
  };
  expect(body.points).toEqual(await regionCounts());
  expect(body.rowCount).toBe((await regionCounts()).length);
  expect(typeof body.durationMs).toBe("number");
  expect(body.ranAt).not.toBeNull();
  expect(body.stale).toBe(false);
});

it("refuses to plot a column that does not hold numbers", async () => {
  const { cookie, sourceId } = await ownerWithSource();
  const dashboardId = await createDashboard(cookie, "Ops overview", [sourceId]);
  const savedQueryId = await saveRegionCounts(cookie, sourceId);

  const created = await chartIt(cookie, dashboardId, {
    savedQueryId,
    chartType: "bar",
    title: "Nonsense",
    labelColumn: "region",
    valueColumn: "region",
  });
  const { widget: placed } = (await created.json()) as { widget: { id: string } };
  const refreshed = await request(`/api/widgets/${placed.id}/refresh`, {
    method: "POST",
    headers: { cookie },
  });
  expect(refreshed.status).toBe(400);

  const res = await request(`/api/widgets/${placed.id}/data`, {
    headers: { cookie },
  });
  expect(res.status).toBe(400);
});

it("404s a chart that belongs to another organization", async () => {
  const { cookie, sourceId } = await ownerWithSource();
  const dashboardId = await createDashboard(cookie, "Ops overview", [sourceId]);
  const savedQueryId = await saveRegionCounts(cookie, sourceId);
  const created = await chartIt(cookie, dashboardId, {
    savedQueryId,
    chartType: "pie",
    title: "Events per region",
    labelColumn: "region",
    valueColumn: "events",
  });
  const { widget: placed } = (await created.json()) as { widget: { id: string } };

  const stranger = await signUp(uniqueEmail());
  const strangerOrg = await authFor(db).api.createOrganization({
    body: { name: "Stranger Org", slug: uniqueSlug() },
    headers: { cookie: stranger.cookie },
  });
  expect(strangerOrg.id).not.toBe("");

  const res = await request(`/api/widgets/${placed.id}/data`, {
    headers: { cookie: stranger.cookie },
  });
  expect(res.status).toBe(404);
});

it("deletes the charts that read a saved query when it goes", async () => {
  const { cookie, sourceId } = await ownerWithSource();
  const dashboardId = await createDashboard(cookie, "Ops overview", [sourceId]);
  const savedQueryId = await saveRegionCounts(cookie, sourceId);
  await chartIt(cookie, dashboardId, {
    savedQueryId,
    chartType: "bar",
    title: "Events per region",
    labelColumn: "region",
    valueColumn: "events",
  });

  const res = await request(`/api/saved-queries/${savedQueryId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  expect(res.status).toBe(200);

  const queries = await db
    .select()
    .from(savedQuery)
    .where(eq(savedQuery.id, savedQueryId));
  expect(queries).toHaveLength(0);
  const widgets = await db
    .select()
    .from(widget)
    .where(eq(widget.dashboardId, dashboardId));
  expect(widgets).toHaveLength(0);
});
