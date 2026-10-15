import { expect, it } from "vitest";
import { authFor } from "../src/common/config/better-auth";
import { db, request, signUp, TEST_POSTGRES_PORT, uniqueEmail, uniqueSlug } from "./helpers";

it("a removed member loses access to the org they were removed from", async () => {
  const owner = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Org", slug: uniqueSlug() },
    headers: { cookie: owner.cookie },
  });
  const bob = await signUp(uniqueEmail());
  await authFor(db).api.addMember({
    body: { userId: bob.user.id, role: "editor", organizationId: org.id },
    headers: { cookie: owner.cookie },
  });
  await authFor(db).api.setActiveOrganization({
    body: { organizationId: org.id },
    headers: { cookie: bob.cookie },
  });

  const created = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie: bob.cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Bob source",
      host: "127.0.0.1",
      port: TEST_POSTGRES_PORT,
      database: "heptadec_test",
      username: "heptadec",
      password: "heptadec",
      readOnly: true,
    }),
  });
  expect(created.status).toBe(200);

  const before = await request("/api/data-sources", {
    headers: { cookie: bob.cookie },
  });
  expect(before.status).toBe(200);
  expect(
    ((await before.json()) as { dataSources: unknown[] }).dataSources,
  ).toHaveLength(1);

  const roster = await request("/api/organization/members", {
    headers: { cookie: owner.cookie },
  });
  const rows = (await roster.json()) as {
    members: Array<{ id: string; userId: string }>;
  };
  const bobsRow = rows.members.find((m) => m.userId === bob.user.id)!;

  const removed = await request(`/api/organization/members/${bobsRow.id}`, {
    method: "DELETE",
    headers: { cookie: owner.cookie },
  });
  expect(removed.status).toBe(200);

  const stillReadable = await request("/api/data-sources", {
    headers: { cookie: bob.cookie },
  });
  expect(stillReadable.status).toBe(403);

  const savedQueries = await request("/api/saved-queries", {
    headers: { cookie: bob.cookie },
  });
  expect(savedQueries.status).toBe(403);

  const dashboards = await request("/api/dashboards", {
    headers: { cookie: bob.cookie },
  });
  expect(dashboards.status).toBe(403);
});