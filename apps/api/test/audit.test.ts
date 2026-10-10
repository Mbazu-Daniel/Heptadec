import { desc, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { db, schema } from "@heptadec/db";
import { auth } from "../src/common/config/better-auth";
import { app, signUp, uniqueEmail, uniqueSlug } from "./helpers";

const { auditLog, user } = schema;

async function auditRows(organizationId: string) {
  return db
    .select()
    .from(auditLog)
    .where(eq(auditLog.organizationId, organizationId))
    .orderBy(desc(auditLog.occurredAt));
}

function headers(cookie: string): Record<string, string> {
  return { cookie, "content-type": "application/json" };
}

it("records an organization created through better auth", async () => {
  const created = await signUp(uniqueEmail());
  const org = await auth.api.createOrganization({
    body: { name: "Audit Works", slug: uniqueSlug() },
    headers: { cookie: created.cookie },
  });

  const rows = await auditRows(org.id);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    event: "organization.created",
    targetKind: "organization",
    targetId: org.id,
    targetLabel: "Audit Works",
    actorId: created.user.id,
  });

  const account = (
    await db.select().from(user).where(eq(user.id, created.user.id))
  )[0]!;
  expect([account.name, account.email]).toContain(rows[0]!.actorLabel);
});

it("records an invitation better auth sends without going through our route", async () => {
  const created = await signUp(uniqueEmail());
  const org = await auth.api.createOrganization({
    body: { name: "Invite Audit", slug: uniqueSlug() },
    headers: { cookie: created.cookie },
  });
  const invitee = uniqueEmail();

  await auth.api.createInvitation({
    body: { email: invitee, role: "editor", organizationId: org.id },
    headers: { cookie: created.cookie },
  });

  const rows = await auditRows(org.id);
  expect(rows.map((row) => row.event).sort()).toEqual([
    "invitation.created",
    "organization.created",
  ]);

  const invited = rows.find((row) => row.event === "invitation.created")!;
  expect(invited).toMatchObject({
    targetKind: "invitation",
    targetLabel: invitee,
    actorId: created.user.id,
    detail: "editor",
  });
});

it("records an mcp token created and revoked through the api", async () => {
  const created = await signUp(uniqueEmail());
  const org = await auth.api.createOrganization({
    body: { name: "Token Audit", slug: uniqueSlug() },
    headers: { cookie: created.cookie },
  });

  const issued = await app.request("/api/mcp-tokens", {
    method: "POST",
    headers: headers(created.cookie),
    body: JSON.stringify({
      name: "Probe",
      capabilities: ["list_data_sources"],
    }),
  });
  expect(issued.status).toBe(201);
  const token = (await issued.json()) as { id: string };

  const revoked = await app.request(`/api/mcp-tokens/${token.id}`, {
    method: "DELETE",
    headers: headers(created.cookie),
  });
  expect(revoked.status).toBe(200);

  const rows = await auditRows(org.id);
  expect(rows.map((row) => row.event).sort()).toEqual([
    "mcp_token.created",
    "mcp_token.revoked",
    "organization.created",
  ]);

  const added = rows.find((row) => row.event === "mcp_token.created")!;
  expect(added).toMatchObject({
    targetKind: "mcp_token",
    targetId: token.id,
    targetLabel: "Probe",
    detail: "list_data_sources",
    actorId: created.user.id,
  });

  const removed = rows.find((row) => row.event === "mcp_token.revoked")!;
  expect(removed).toMatchObject({
    targetKind: "mcp_token",
    targetId: token.id,
    targetLabel: "Probe",
    actorId: created.user.id,
  });
});

it("keeps each organization's rows to itself when read back", async () => {
  const member = await signUp(uniqueEmail());
  const first = await auth.api.createOrganization({
    body: { name: "First Org", slug: uniqueSlug() },
    headers: { cookie: member.cookie },
  });
  const second = await auth.api.createOrganization({
    body: { name: "Second Org", slug: uniqueSlug() },
    headers: { cookie: member.cookie },
  });

  const firstRows = await auditRows(first.id);
  const secondRows = await auditRows(second.id);
  expect(firstRows).toHaveLength(1);
  expect(secondRows).toHaveLength(1);

  const listAs = async (organizationId: string) => {
    await app.request("/api/organization/switch", {
      method: "POST",
      headers: headers(member.cookie),
      body: JSON.stringify({ organizationId }),
    });
    const res = await app.request("/api/audit-logs", {
      headers: { cookie: member.cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      auditLogs: Array<{ id: string; targetId: string }>;
    };
    return body.auditLogs;
  };

  const fromFirst = await listAs(first.id);
  expect(fromFirst.map((row) => row.id)).toEqual(firstRows.map((row) => row.id));

  const fromSecond = await listAs(second.id);
  expect(fromSecond.map((row) => row.id)).toEqual(
    secondRows.map((row) => row.id),
  );
  expect(fromFirst.map((row) => row.id)).not.toContain(fromSecond[0]!.id);
});
