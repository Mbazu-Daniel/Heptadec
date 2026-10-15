import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { db, request, signUp, TEST_POSTGRES, uniqueEmail, uniqueSlug } from "./helpers";
import { nextRunAfter, parseCron } from "../src/modules/scheduler/cron";

const { dashboard, shareLink, widget, savedQuery, queryResult, member, dataSource } =
  schema;

async function owner(): Promise<{ cookie: string; organizationId: string }> {
  const { cookie } = await signUp(uniqueEmail());
  const created = await authFor(db).api.createOrganization({
    body: { name: "Org", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, organizationId: created.id };
}

it("answers a malformed JSON body with 400, not 500", async () => {
  const { cookie, organizationId } = await owner();
  const res = await request("/api/dashboards", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: "{not json",
  });
  expect(res.status).toBe(400);
  expect(organizationId).not.toBe("");
});

it("rejects a connection URL with broken percent-encoding", async () => {
  const { cookie } = await owner();
  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Broken escape",
      url: "postgres://user@host/%ZZ",
    }),
  });
  expect(res.status).toBe(400);
});

it("does not hand back postgres' own error text", async () => {
  const { cookie } = await owner();
  const created = await request("/api/data-sources", {
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
  expect(created.status).toBe(200);
  const id = ((await created.json()) as { dataSource: { id: string } }).dataSource.id;

  const res = await request(`/api/data-sources/${id}/query`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ sql: "SELECT * FROM secret_customer_pii_table" }),
  });
  expect(res.status).toBe(400);

  const text = await res.text();
  expect(text).not.toContain("secret_customer_pii_table");
  expect(text).not.toContain(TEST_POSTGRES.password);
});

it("refuses a widget refresh from someone who cannot edit", async () => {
  const ownerSession = await owner();
  const created = await request("/api/data-sources", {
    method: "POST",
    headers: {
      cookie: ownerSession.cookie,
      "content-type": "application/json",
    },
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
  const sourceId = ((await created.json()) as { dataSource: { id: string } })
    .dataSource.id;

  const query = await request(`/api/data-sources/${sourceId}/saved-queries`, {
    method: "POST",
    headers: {
      cookie: ownerSession.cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "Region counts", sql: "SELECT region, count(*)::int AS events FROM events GROUP BY region" }),
  });
  const queryId = ((await query.json()) as { savedQuery: { id: string } })
    .savedQuery.id;

  const made = await request("/api/dashboards", {
    method: "POST",
    headers: {
      cookie: ownerSession.cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: "Ops", dataSourceIds: [sourceId] }),
  });
  const dashboardId = ((await made.json()) as { dashboard: { id: string } })
    .dashboard.id;

  const withWidget = await request(`/api/dashboards/${dashboardId}/widgets`, {
    method: "POST",
    headers: {
      cookie: ownerSession.cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ title: "Regions", savedQueryId: queryId, chartType: "bar", labelColumn: "region", valueColumn: "events" }),
  });
  expect(withWidget.status).toBe(201);
  const widgetId = ((await withWidget.json()) as { widget: { id: string } })
    .widget.id;

  const viewer = await signUp(uniqueEmail());
  await authFor(db).api.addMember({
    body: {
      userId: viewer.user.id,
      role: "viewer",
      organizationId: ownerSession.organizationId,
    },
    headers: { cookie: ownerSession.cookie },
  });
  await authFor(db).api.setActiveOrganization({
    body: { organizationId: ownerSession.organizationId },
    headers: { cookie: viewer.cookie },
  });

  const refresh = await request(`/api/widgets/${widgetId}/refresh`, {
    method: "POST",
    headers: { cookie: viewer.cookie },
  });
  expect(refresh.status).toBe(403);

  const schema_ = await request(`/api/data-sources/${sourceId}/schema`, {
    headers: { cookie: viewer.cookie },
  });
  expect(schema_.status).toBe(403);
});

it("deletes a dashboard's share links with the dashboard", async () => {
  const { cookie, organizationId } = await owner();
  const [fixture] = await db
    .insert(dataSource)
    .values({
      organizationId,
      kind: "postgres",
      name: "Fixture",
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  const made = await request("/api/dashboards", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Doomed", dataSourceIds: [fixture!.id] }),
  });
  const dashboardId = ((await made.json()) as { dashboard: { id: string } })
    .dashboard.id;

  const shared = await request(`/api/dashboards/${dashboardId}/share-links`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  expect(shared.status).toBe(201);
  const listed = (await shared.json()) as { url: string };
  const token = listed.url.split("/share/")[1]!;

  const beforeDelete = await request(`/api/share/${token}`);
  expect(beforeDelete.status).toBe(200);

  const removed = await request(`/api/dashboards/${dashboardId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  expect(removed.status).toBe(200);

  const afterDelete = await request(`/api/share/${token}`);
  expect(afterDelete.status).toBe(404);

  const rows = await db
    .select()
    .from(shareLink)
    .where(eq(shareLink.dashboardId, dashboardId));
  expect(rows).toHaveLength(0);
});

it("keeps only the newest cached result for a saved query", async () => {
  const { cookie } = await owner();
  const created = await request("/api/data-sources", {
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
  const sourceId = ((await created.json()) as { dataSource: { id: string } })
    .dataSource.id;
  const query = await request(`/api/data-sources/${sourceId}/saved-queries`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Q",
      sql: "SELECT region, count(*)::int AS events FROM events GROUP BY region",
    }),
  });
  const queryId = ((await query.json()) as { savedQuery: { id: string } })
    .savedQuery.id;

  const made = await request("/api/dashboards", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Cache", dataSourceIds: [sourceId] }),
  });
  const dashboardId = ((await made.json()) as { dashboard: { id: string } })
    .dashboard.id;
  const withWidget = await request(`/api/dashboards/${dashboardId}/widgets`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      title: "T",
      savedQueryId: queryId,
      chartType: "bar",
      labelColumn: "region",
      valueColumn: "events",
    }),
  });
  expect(withWidget.status).toBe(201);
  const widgetId = ((await withWidget.json()) as { widget: { id: string } })
    .widget.id;

  for (let i = 0; i < 3; i += 1) {
    const res = await request(`/api/widgets/${widgetId}/refresh`, {
      method: "POST",
      headers: { cookie },
    });
    expect(res.status).toBe(200);
  }

  const rows = await db
    .select()
    .from(queryResult)
    .where(eq(queryResult.savedQueryId, queryId));
  expect(rows).toHaveLength(1);
});

it("finds the next leap day from any day in the cycle", () => {
  for (const from of [
    "2024-03-01T12:00:00Z",
    "2025-06-15T12:00:00Z",
    "2026-01-01T00:00:00Z",
    "2027-12-31T23:00:00Z",
  ]) {
    const next = nextRunAfter(parseCron("0 0 29 2 *"), "UTC", new Date(from));
    expect(next.toISOString()).toBe("2028-02-29T00:00:00.000Z");
  }
});

it("still refuses a day that never exists", () => {
  expect(() =>
    nextRunAfter(parseCron("0 0 30 2 *"), "UTC", new Date("2026-01-01T00:00:00Z")),
  ).toThrow(/no run time/);
});

it("keeps read-only on even when options try to turn it off", async () => {
  const { cookie } = await owner();
  const created = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Sneaky options",
      host: TEST_POSTGRES.host,
      port: TEST_POSTGRES.port,
      database: TEST_POSTGRES.database,
      username: TEST_POSTGRES.user,
      password: TEST_POSTGRES.password,
      readOnly: true,
      options: "-c default_transaction_read_only=off",
    }),
  });
  expect(created.status).toBe(200);
  const id = ((await created.json()) as { dataSource: { id: string } }).dataSource.id;

  const before = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.id, id));
  expect(before).toHaveLength(1);

  const res = await request(`/api/data-sources/${id}/query`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      sql: "INSERT INTO events (id, event_name, region) VALUES ('opt-write','x','eu')",
    }),
  });
  expect(res.status).toBe(400);
  expect(await res.text()).toContain("read-only");
});
