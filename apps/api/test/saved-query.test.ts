import { desc, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { request, signUp, uniqueEmail, uniqueSlug, db } from "./helpers";

const { dataSource, queryResult, queryVersion, savedQuery } = schema;

async function ownerWithOrg(): Promise<{ cookie: string; orgId: string }> {
  const { cookie } = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Views Org", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, orgId: org.id };
}

async function createSource(
  cookie: string,
): Promise<string> {
  const name = `Warehouse ${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ kind: "postgres", name, host: "db.internal", port: 5432, database: "warehouse", username: "readonly_svc", password: "s3cret-password", readOnly: true }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.name, name))
    .limit(1);
  return rows[0]!.id;
}

async function save(cookie: string, sourceId: string, body: unknown): Promise<Response> {
  return request(`/api/data-sources/${sourceId}/saved-queries`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function rowsFor(sourceId: string): Promise<Array<typeof savedQuery.$inferSelect>> {
  return db
    .select()
    .from(savedQuery)
    .where(eq(savedQuery.dataSourceId, sourceId));
}

it("persists a saved query the owner can read back", async () => {
  const { cookie } = await ownerWithOrg();
  const sourceId = await createSource(cookie);

  const res = await save(cookie, sourceId, {
    name: "Active users",
    sql: "SELECT id FROM users WHERE active",
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { savedQuery: { id: string; name: string; sql: string } };
  expect(body.savedQuery.name).toBe("Active users");

  const rows = await rowsFor(sourceId);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.name).toBe("Active users");
  expect(rows[0]!.sql).toBe("SELECT id FROM users WHERE active");
  expect(body.savedQuery.id).toBe(rows[0]!.id);
});

it("renames a saved query and leaves the SQL untouched", async () => {
  const { cookie } = await ownerWithOrg();
  const sourceId = await createSource(cookie);
  const created = await save(cookie, sourceId, { name: "Old", sql: "SELECT 1" });
  const { savedQuery: createdQuery } = (await created.json()) as { savedQuery: { id: string } };

  const res = await request(`/api/saved-queries/${createdQuery.id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "New" }),
  });
  expect(res.status).toBe(200);

  const rows = await rowsFor(sourceId);
  expect(rows[0]!.name).toBe("New");
  expect(rows[0]!.sql).toBe("SELECT 1");
});

it("deletes a saved query and leaves the database without it", async () => {
  const { cookie, orgId } = await ownerWithOrg();
  const sourceId = await createSource(cookie);
  const created = await save(cookie, sourceId, { name: "Gone", sql: "SELECT 1" });
  const { savedQuery: createdQuery } = (await created.json()) as { savedQuery: { id: string } };

  await db.insert(queryResult).values({
    organizationId: orgId,
    savedQueryId: createdQuery.id,
    ranAt: new Date(),
    ttlSeconds: 60,
    payload: "{}",
  });
  await db.insert(queryVersion).values({
    organizationId: orgId,
    savedQueryId: createdQuery.id,
    name: "Gone",
    sql: "SELECT 1",
    createdAt: new Date(),
  });

  const res = await request(`/api/saved-queries/${createdQuery.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  expect(res.status).toBe(200);

  expect(await rowsFor(sourceId)).toHaveLength(0);
  expect(
    await db
      .select()
      .from(queryResult)
      .where(eq(queryResult.savedQueryId, createdQuery.id)),
  ).toHaveLength(0);
  expect(
    await db
      .select()
      .from(queryVersion)
      .where(eq(queryVersion.savedQueryId, createdQuery.id)),
  ).toHaveLength(0);
});

it("404s a saved query that belongs to another organization", async () => {
  const { cookie } = await ownerWithOrg();
  const sourceId = await createSource(cookie);
  const created = await save(cookie, sourceId, { name: "Mine", sql: "SELECT 1" });
  const { savedQuery: createdQuery } = (await created.json()) as { savedQuery: { id: string } };

  const stranger = await ownerWithOrg();
  const res = await request(`/api/saved-queries/${createdQuery.id}`, {
    method: "PATCH",
    headers: { cookie: stranger.cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Hijacked" }),
  });
  expect(res.status).toBe(404);

  const rows = await rowsFor(sourceId);
  expect(rows[0]!.name).toBe("Mine");
});

it("refuses a viewer who cannot save queries", async () => {
  const { cookie, orgId } = await ownerWithOrg();
  const sourceId = await createSource(cookie);

  const { user: viewer, cookie: viewerCookie } = await signUp(uniqueEmail());
  await authFor(db).api.addMember({
    body: { userId: viewer.id, role: "viewer", organizationId: orgId },
  });
  await request("/api/organization/switch", {
    method: "POST",
    headers: { cookie: viewerCookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId: orgId }),
  });

  const res = await save(viewerCookie, sourceId, { name: "Nope", sql: "SELECT 1" });
  expect(res.status).toBe(403);

  expect(await rowsFor(sourceId)).toHaveLength(0);
});

async function versionsFor(savedQueryId: string): Promise<Array<typeof queryVersion.$inferSelect>> {
  return db
    .select()
    .from(queryVersion)
    .where(eq(queryVersion.savedQueryId, savedQueryId))
    .orderBy(desc(queryVersion.createdAt));
}

it("keeps a version of a saved query before every real edit", async () => {
  const { cookie } = await ownerWithOrg();
  const sourceId = await createSource(cookie);
  const created = await save(cookie, sourceId, { name: "v0", sql: "SELECT 1" });
  const { savedQuery: createdQuery } = (await created.json()) as { savedQuery: { id: string } };

  await request(`/api/saved-queries/${createdQuery.id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ sql: "SELECT 2" }),
  });
  await request(`/api/saved-queries/${createdQuery.id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ sql: "SELECT 3" }),
  });

  const versions = await versionsFor(createdQuery.id);
  expect(versions).toHaveLength(2);
  expect(versions[0]!.sql).toBe("SELECT 2");
  expect(versions[1]!.sql).toBe("SELECT 1");

  const live = await rowsFor(sourceId);
  expect(live[0]!.sql).toBe("SELECT 3");
});

it("does not write a version when an edit changes nothing", async () => {
  const { cookie } = await ownerWithOrg();
  const sourceId = await createSource(cookie);
  const created = await save(cookie, sourceId, { name: "Same", sql: "SELECT 1" });
  const { savedQuery: createdQuery } = (await created.json()) as { savedQuery: { id: string } };

  const res = await request(`/api/saved-queries/${createdQuery.id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Same" }),
  });
  expect(res.status).toBe(200);

  expect(await versionsFor(createdQuery.id)).toHaveLength(0);
});

it("restores an earlier version and keeps the replaced state as a new version", async () => {
  const { cookie } = await ownerWithOrg();
  const sourceId = await createSource(cookie);
  const created = await save(cookie, sourceId, { name: "v0", sql: "SELECT 1" });
  const { savedQuery: createdQuery } = (await created.json()) as { savedQuery: { id: string } };

  await request(`/api/saved-queries/${createdQuery.id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ sql: "SELECT 2" }),
  });
  const versions = await versionsFor(createdQuery.id);
  const v0 = versions[0]!; 
  const res = await request(`/api/saved-queries/${createdQuery.id}/restore`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ versionId: v0.id }),
  });
  expect(res.status).toBe(200);
  const { savedQuery: restored } = (await res.json()) as { savedQuery: { sql: string } };
  expect(restored.sql).toBe("SELECT 1");

  const live = await rowsFor(sourceId);
  expect(live[0]!.sql).toBe("SELECT 1");
  const after = await versionsFor(createdQuery.id);
  expect(after).toHaveLength(2);
  expect(after[0]!.sql).toBe("SELECT 2");
});

it("404s a restore of a version from another organization", async () => {
  const { cookie } = await ownerWithOrg();
  const sourceId = await createSource(cookie);
  const created = await save(cookie, sourceId, { name: "v0", sql: "SELECT 1" });
  const { savedQuery: createdQuery } = (await created.json()) as { savedQuery: { id: string } };
  await request(`/api/saved-queries/${createdQuery.id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ sql: "SELECT 2" }),
  });
  const versions = await versionsFor(createdQuery.id);
  const v0 = versions[0]!;

  const stranger = await ownerWithOrg();
  const res = await request(`/api/saved-queries/${createdQuery.id}/restore`, {
    method: "POST",
    headers: { cookie: stranger.cookie, "content-type": "application/json" },
    body: JSON.stringify({ versionId: v0.id }),
  });
  expect(res.status).toBe(404);

  const live = await rowsFor(sourceId);
  expect(live[0]!.sql).toBe("SELECT 2");
});

async function record(cookie: string, sourceId: string, sql: string): Promise<Response> {
  return request(`/api/data-sources/${sourceId}/saved-queries/runs`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ sql }),
  });
}

it("stores a run as a saved query, named after the statement", async () => {
  const { cookie } = await ownerWithOrg();
  const sourceId = await createSource(cookie);

  const res = await record(cookie, sourceId, "SELECT count(*) FROM orders");
  expect(res.status).toBe(201);

  const rows = await rowsFor(sourceId);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.sql).toBe("SELECT count(*) FROM orders");
  expect(rows[0]!.name).toBe("SELECT count(*) FROM orders");
});

it("records the same statement once, not once per run", async () => {
  const { cookie } = await ownerWithOrg();
  const sourceId = await createSource(cookie);

  await record(cookie, sourceId, "SELECT 1");
  const second = await record(cookie, sourceId, "SELECT 1");
  expect(second.status).toBe(200);

  const rows = await rowsFor(sourceId);
  expect(rows).toHaveLength(1);
});

it("keeps a name the user chose when the same statement runs again", async () => {
  const { cookie } = await ownerWithOrg();
  const sourceId = await createSource(cookie);

  await save(cookie, sourceId, { name: "Nightly count", sql: "SELECT 2" });
  await record(cookie, sourceId, "SELECT 2");

  const rows = await rowsFor(sourceId);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.name).toBe("Nightly count");
});

it("does not let one organization record runs against another's source", async () => {
  const { cookie, orgId } = await ownerWithOrg();
  const sourceId = await createSource(cookie);
  const other = await ownerWithOrg();

  const res = await request(`/api/data-sources/${sourceId}/saved-queries/runs`, {
    method: "POST",
    headers: { cookie: other.cookie, "content-type": "application/json" },
    body: JSON.stringify({ sql: "SELECT 3" }),
  });
  expect(res.status).toBe(404);
  expect(await rowsFor(sourceId)).toHaveLength(0);
  expect(orgId).not.toBe("");
});

it("refuses to record a run for a viewer", async () => {
  const { cookie, orgId } = await ownerWithOrg();
  const sourceId = await createSource(cookie);

  const { user: viewer, cookie: viewerCookie } = await signUp(uniqueEmail());
  await authFor(db).api.addMember({
    body: { userId: viewer.id, role: "viewer", organizationId: orgId },
  });
  await request("/api/organization/switch", {
    method: "POST",
    headers: { cookie: viewerCookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId: orgId }),
  });

  const res = await record(viewerCookie, sourceId, "SELECT 4");
  expect(res.status).toBe(403);
  expect(await rowsFor(sourceId)).toHaveLength(0);
});
