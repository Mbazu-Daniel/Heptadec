import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { db, request, signUp, TEST_POSTGRES, uniqueEmail, uniqueSlug } from "./helpers";

const { dataSource, shareLink, widget } = schema;

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
    body: { name: "Share Org", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, orgId: org.id };
}

async function ownerWithChart(): Promise<{
  cookie: string;
  orgId: string;
  dashboardId: string;
}> {
  const { cookie, orgId } = await ownerWithOrg();

  const source = await request("/api/data-sources", {
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
  expect(source.status).toBe(200);

  const sourceRows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, orgId));
  const saved = await request(`/api/data-sources/${sourceRows[0]!.id}/saved-queries`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Events per region", sql: REGION_COUNTS }),
  });
  const { savedQuery } = (await saved.json()) as { savedQuery: { id: string } };

  const dash = await request("/api/dashboards", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Ops overview",
      dataSourceIds: [sourceRows[0]!.id],
    }),
  });
  const { dashboard } = (await dash.json()) as { dashboard: { id: string } };

  const chart = await request(`/api/dashboards/${dashboard.id}/widgets`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      savedQueryId: savedQuery.id,
      chartType: "bar",
      title: "Events per region",
      labelColumn: "region",
      valueColumn: "events",
    }),
  });
  expect(chart.status).toBe(201);

  return { cookie, orgId, dashboardId: dashboard.id };
}

async function createLink(
  cookie: string,
  dashboardId: string,
  body: unknown = {},
): Promise<{ token: string; id: string }> {
  const res = await request(`/api/dashboards/${dashboardId}/share-links`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(201);
  const payload = (await res.json()) as { shareLink: { id: string }; url: string };
  return { token: payload.url.split("/share/")[1]!, id: payload.shareLink.id };
}

function shareLinkRow(dashboardId: string) {
  return db.select().from(shareLink).where(eq(shareLink.dashboardId, dashboardId));
}

let clientSeq = 0;

function publicGet(token: string): Promise<Response> | Response {
  return request(`/api/share/${token}`, {
    headers: { "x-forwarded-for": `10.0.0.${++clientSeq}` },
  });
}

it("persists a share link with the token hashed and a frozen snapshot", async () => {
  const { cookie, orgId, dashboardId } = await ownerWithChart();

  const { token, id } = await createLink(cookie, dashboardId, { expiresInDays: 7 });
  expect(token).toHaveLength(10);

  const rows = await shareLinkRow(dashboardId);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.id).toBe(id);
  expect(rows[0]!.organizationId).toBe(orgId);
  expect(rows[0]!.tokenHash).toBe(
    createHash("sha256").update(token).digest("hex"),
  );
  expect(rows[0]!.snapshot).not.toContain(token);
  const expiresAt = rows[0]!.expiresAt?.getTime() ?? 0;
  expect(expiresAt).toBeGreaterThan(Date.now() + 6 * 24 * 60 * 60 * 1000);
  expect(expiresAt).toBeLessThan(Date.now() + 8 * 24 * 60 * 60 * 1000);
  const frozen = JSON.parse(rows[0]!.snapshot) as {
    name: string;
    widgets: Array<{ title: string; points: unknown }>;
  };
  expect(frozen.name).toBe("Ops overview");
  expect(frozen.widgets).toHaveLength(1);
  expect(frozen.widgets[0]!.title).toBe("Events per region");
  expect(frozen.widgets[0]!.points).toEqual(await regionCounts());
});

it("serves the frozen dashboard to anyone holding the token", async () => {
  const { cookie, dashboardId } = await ownerWithChart();
  const { token } = await createLink(cookie, dashboardId);
  const res = await publicGet(token);
  expect(res.status).toBe(200);

  const body = (await res.json()) as {
    dashboard: {
      name: string;
      widgets: Array<{ title: string; points: unknown }>;
    };
  };
  expect(body.dashboard.name).toBe("Ops overview");
  expect(body.dashboard.widgets[0]!.points).toEqual(await regionCounts());
});

it("404s a revoked link", async () => {
  const { cookie, dashboardId } = await ownerWithChart();
  const { token, id } = await createLink(cookie, dashboardId);

  const revoked = await request(`/api/share-links/${id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  expect(revoked.status).toBe(200);
  expect(await shareLinkRow(dashboardId)).toHaveLength(0);

  const res = await publicGet(token);
  expect(res.status).toBe(404);
});

it("404s an expired link", async () => {
  const { cookie, dashboardId } = await ownerWithChart();
  const { token, id } = await createLink(cookie, dashboardId, { expiresInDays: 1 });

  await db
    .update(shareLink)
    .set({ expiresAt: new Date(Date.now() - 60_000) })
    .where(eq(shareLink.id, id));

  const res = await publicGet(token);
  expect(res.status).toBe(404);
});

it("refuses an expiry it cannot honour", async () => {
  const { cookie, dashboardId } = await ownerWithChart();

  const res = await request(`/api/dashboards/${dashboardId}/share-links`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ expiresInDays: 400 }),
  });
  expect(res.status).toBe(400);
  expect(await shareLinkRow(dashboardId)).toHaveLength(0);
});

it("404s share-link management from another organization", async () => {
  const { cookie, dashboardId } = await ownerWithChart();
  const { id } = await createLink(cookie, dashboardId);

  const stranger = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Stranger Org", slug: uniqueSlug() },
    headers: { cookie: stranger.cookie },
  });
  expect(org.id).not.toBe("");

  const list = await request(`/api/dashboards/${dashboardId}/share-links`, {
    headers: { cookie: stranger.cookie },
  });
  expect(list.status).toBe(404);

  const revoke = await request(`/api/share-links/${id}`, {
    method: "DELETE",
    headers: { cookie: stranger.cookie },
  });
  expect(revoke.status).toBe(404);
  expect(await shareLinkRow(dashboardId)).toHaveLength(1);
});

it("refuses a viewer who cannot share a dashboard", async () => {
  const { cookie, orgId, dashboardId } = await ownerWithChart();

  const { user: viewer, cookie: viewerCookie } = await signUp(uniqueEmail());
  await authFor(db).api.addMember({
    body: { userId: viewer.id, role: "viewer", organizationId: orgId },
  });
  await request("/api/organization/switch", {
    method: "POST",
    headers: { cookie: viewerCookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId: orgId }),
  });

  const res = await request(`/api/dashboards/${dashboardId}/share-links`, {
    method: "POST",
    headers: { cookie: viewerCookie, "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  expect(res.status).toBe(403);
  expect(await shareLinkRow(dashboardId)).toHaveLength(0);
});

it("rate limits the public view", async () => {
  const { cookie, dashboardId } = await ownerWithChart();
  const { token } = await createLink(cookie, dashboardId);
  let throttled = false;
  for (let attempt = 0; attempt < 60 && !throttled; attempt++) {
    const res = await request(`/api/share/${token}`, {
      headers: { "x-forwarded-for": "10.9.9.9" },
    });
    if (res.status === 429) {
      throttled = true;
    }
  }
  expect(throttled).toBe(true);
});

it("refreshes the snapshot from the database behind it", async () => {
  const { cookie, dashboardId } = await ownerWithChart();
  const { token, id } = await createLink(cookie, dashboardId);
  const before = await regionCounts();
  const { default: pg } = await import("pg");
  const client = new pg.Client(TEST_POSTGRES);
  await client.connect();
  try {
    await client.query(
      "INSERT INTO events(id,event_name,region) VALUES ('refresh-probe','checkout','us-east-1')",
    );
    const refreshed = await request(`/api/share-links/${id}/refresh`, {
      method: "POST",
      headers: { cookie },
    });
    expect(refreshed.status).toBe(200);

    const res = await publicGet(token);
    const body = (await res.json()) as {
      dashboard: {
        widgets: Array<{ points: Array<{ label: string; value: number }> }>;
      };
    };
    expect(body.dashboard.widgets[0]!.points).toEqual(
      before.map((point) => ({
        label: point.label,
        value: point.value + (point.label === "us-east-1" ? 1 : 0),
      })),
    );
  } finally {
    await client.query("DELETE FROM events WHERE id = 'refresh-probe'");
    await client.end();
  }
  const widgets = await db
    .select()
    .from(widget)
    .where(eq(widget.dashboardId, dashboardId));
  expect(widgets).toHaveLength(1);
});
