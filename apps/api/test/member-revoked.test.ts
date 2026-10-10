import { expect, it } from "vitest";
import { auth } from "../src/common/config/better-auth";
import { app, signUp, uniqueEmail, uniqueSlug } from "./helpers";

it("a removed member loses access to the org they were removed from", async () => {
  const owner = await signUp(uniqueEmail());
  const org = await auth.api.createOrganization({
    body: { name: "Org", slug: uniqueSlug() },
    headers: { cookie: owner.cookie },
  });
  const bob = await signUp(uniqueEmail());
  await auth.api.addMember({
    body: { userId: bob.user.id, role: "editor", organizationId: org.id },
    headers: { cookie: owner.cookie },
  });
  await auth.api.setActiveOrganization({
    body: { organizationId: org.id },
    headers: { cookie: bob.cookie },
  });

  const created = await app.request("/api/data-sources", {
    method: "POST",
    headers: { cookie: bob.cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Bob source",
      host: "127.0.0.1",
      port: 5434,
      database: "heptadec_test",
      username: "heptadec",
      password: "heptadec",
      readOnly: true,
    }),
  });
  expect(created.status).toBe(200);

  const before = await app.request("/api/data-sources", {
    headers: { cookie: bob.cookie },
  });
  expect(before.status).toBe(200);
  expect(
    ((await before.json()) as { dataSources: unknown[] }).dataSources,
  ).toHaveLength(1);

  const roster = await app.request("/api/organization/members", {
    headers: { cookie: owner.cookie },
  });
  const rows = (await roster.json()) as {
    members: Array<{ id: string; userId: string }>;
  };
  const bobsRow = rows.members.find((m) => m.userId === bob.user.id)!;

  const removed = await app.request(`/api/organization/members/${bobsRow.id}`, {
    method: "DELETE",
    headers: { cookie: owner.cookie },
  });
  expect(removed.status).toBe(200);

  const stillReadable = await app.request("/api/data-sources", {
    headers: { cookie: bob.cookie },
  });
  expect(stillReadable.status).toBe(403);

  const savedQueries = await app.request("/api/saved-queries", {
    headers: { cookie: bob.cookie },
  });
  expect(savedQueries.status).toBe(403);

  const dashboards = await app.request("/api/dashboards", {
    headers: { cookie: bob.cookie },
  });
  expect(dashboards.status).toBe(403);
});