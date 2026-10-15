import { eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { decryptSecret } from "../src/modules/data-source/secret";
import type { INotificationConfig } from "../src/modules/notification/contracts";
import { request, signUp, uniqueEmail, uniqueSlug, db } from "./helpers";

const { notificationChannel } = schema;

const touched: string[] = [];

afterAll(async () => {
  for (const id of touched) {
    await db.delete(notificationChannel).where(eq(notificationChannel.id, id));
  }
});

async function owner(): Promise<{ cookie: string; orgId: string }> {
  const { cookie } = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Notify Org", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, orgId: org.id };
}

async function saveChannel(
  cookie: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return request("/api/notification-channels", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function rowsOf(
  orgId: string,
  name: string,
): Promise<(typeof notificationChannel.$inferSelect)[]> {
  const rows = await db
    .select()
    .from(notificationChannel)
    .where(eq(notificationChannel.organizationId, orgId));
  return rows.filter((row) => row.name === name);
}

it("stores each kind's settings sealed, with the addresses beside them", async () => {
  const { cookie, orgId } = await owner();

  const cases: Record<string, unknown>[] = [
    {
      name: "Team chat",
      kind: "slack",
      webhookUrl: "https://hooks.slack.com/services/T1/B2/secret",
      channel: "#alerts",
    },
    {
      name: "Mailbox",
      kind: "email",
      smtpHost: "smtp.example.com",
      smtpPort: 2525,
      username: "mailer",
      password: "mail-secret",
      fromAddress: "alerts@example.com",
      recipients: ["ops@example.com", "oncall@example.com"],
    },
    {
      name: "Post",
      kind: "resend",
      apiKey: "re_secret",
      fromAddress: "alerts@example.com",
      recipients: ["ops@example.com"],
    },
  ];

  for (const body of cases) {
    const res = await saveChannel(cookie, body);
    expect(res.status, JSON.stringify(body)).toBe(201);
  }

  for (const body of cases) {
    const label = body.name as string;
    const rows = await rowsOf(orgId, label);
    expect(rows, label).toHaveLength(1);
    touched.push(rows[0]!.id);
    const { name: _name, recipients, kind, ...settings } = body;
    expect(JSON.parse(await decryptSecret(rows[0]!.config)), label).toEqual({
      ...settings,
      kind,
      ...(settings.channel === "" ? { channel: null } : {}),
    });
    expect(rows[0]!.name).toBe(label);
    expect(JSON.parse(rows[0]!.recipients)).toEqual(recipients ?? []);
  }

  const mail = await rowsOf(orgId, "Mailbox");
  const email = JSON.parse(await decryptSecret(mail[0]!.config)) as INotificationConfig;
  expect(email.kind === "email" && email.password).toBe("mail-secret");
  expect(JSON.parse(mail[0]!.recipients)).toEqual([
    "ops@example.com",
    "oncall@example.com",
  ]);
});

it("keeps a secret the form left blank, and never sends it back", async () => {
  const { cookie, orgId } = await owner();

  const res = await saveChannel(cookie, {
    name: "Inbox",
    kind: "email",
    smtpHost: "smtp.example.com",
    smtpPort: 587,
    username: "mailer",
    password: "first-secret",
    fromAddress: "alerts@example.com",
    recipients: ["ops@example.com"],
  });
  const { notificationChannel: placed } = (await res.json()) as {
    notificationChannel: { id: string; config: Record<string, unknown> };
  };
  touched.push(placed.id);

  expect(JSON.stringify(placed.config)).not.toContain("first-secret");
  expect(placed.config).toEqual({
    kind: "email",
    smtpHost: "smtp.example.com",
    smtpPort: 587,
    username: "mailer",
    fromAddress: "alerts@example.com",
  });

  const edited = await request(`/api/notification-channels/${placed.id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Inbox",
      kind: "email",
      smtpHost: "smtp.example.com",
      smtpPort: 587,
      username: "mailer",
      password: "",
      fromAddress: "alerts@example.com",
      recipients: ["sre@example.com"],
    }),
  });
  expect(edited.status).toBe(200);

  const rows = await rowsOf(orgId, "Inbox");
  const email = JSON.parse(await decryptSecret(rows[0]!.config)) as INotificationConfig;
  expect(email.kind === "email" && email.password).toBe("first-secret");
  expect(JSON.parse(rows[0]!.recipients)).toEqual(["sre@example.com"]);
});

it("refuses a channel that is missing what its kind needs, and stores nothing", async () => {
  const { cookie, orgId } = await owner();

  const refused: Record<string, unknown>[] = [
    { name: "No url", kind: "slack" },
    { name: "Bad url", kind: "slack", webhookUrl: "hooks.slack.com/x" },
    { name: "Unknown", kind: "carrier-pigeon", webhookUrl: "https://x.test" },
    {
      name: "No sender",
      kind: "email",
      smtpHost: "smtp.example.com",
      recipients: ["ops@example.com"],
    },
    {
      name: "Bad port",
      kind: "email",
      smtpHost: "smtp.example.com",
      smtpPort: 70000,
      fromAddress: "alerts@example.com",
      recipients: ["ops@example.com"],
    },
    {
      name: "Bad recipient",
      kind: "email",
      smtpHost: "smtp.example.com",
      fromAddress: "alerts@example.com",
      recipients: ["nope"],
    },
    {
      name: "No recipients",
      kind: "resend",
      apiKey: "re_x",
      fromAddress: "alerts@example.com",
    },
    {
      name: "Stray addresses",
      kind: "slack",
      webhookUrl: "https://example.com/hook",
      recipients: ["ops@example.com"],
    },
  ];

  for (const body of refused) {
    const res = await saveChannel(cookie, body);
    expect(res.status, JSON.stringify(body)).toBe(400);
    expect(await rowsOf(orgId, body.name as string)).toHaveLength(0);
  }
});

it("clears a setting the client can see, but never one it cannot", async () => {
  const { cookie, orgId } = await owner();

  const res = await saveChannel(cookie, {
    name: "Chat",
    kind: "slack",
    webhookUrl: "https://hooks.slack.com/services/T1/B2/xyz",
    channel: "#alerts",
  });
  const { notificationChannel: placed } = (await res.json()) as {
    notificationChannel: { id: string };
  };
  touched.push(placed.id);

  const edited = await request(`/api/notification-channels/${placed.id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Chat",
      kind: "slack",
      webhookUrl: "",
      channel: "",
    }),
  });
  expect(edited.status).toBe(200);

  const rows = await rowsOf(orgId, "Chat");
  expect(JSON.parse(await decryptSecret(rows[0]!.config))).toEqual({
    kind: "slack",
    webhookUrl: "https://hooks.slack.com/services/T1/B2/xyz",
    channel: null,
  });
});

it("404s another organization's channel and refuses one a viewer tries to add", async () => {
  const { cookie, orgId } = await owner();
  const res = await saveChannel(cookie, {
    name: "Mine",
    kind: "slack",
    webhookUrl: "https://example.com/hook",
  });
  const { notificationChannel: placed } = (await res.json()) as {
    notificationChannel: { id: string };
  };
  touched.push(placed.id);

  const stranger = await signUp(uniqueEmail());
  await authFor(db).api.createOrganization({
    body: { name: "Stranger Org", slug: uniqueSlug() },
    headers: { cookie: stranger.cookie },
  });

  const listed = await request("/api/notification-channels", {
    headers: { cookie: stranger.cookie },
  });
  expect(
    ((await listed.json()) as { notificationChannels: unknown[] })
      .notificationChannels,
  ).toHaveLength(0);

  const removed = await request(`/api/notification-channels/${placed.id}`, {
    method: "DELETE",
    headers: { cookie: stranger.cookie },
  });
  expect(removed.status).toBe(404);

  const renamed = await request(`/api/notification-channels/${placed.id}`, {
    method: "PATCH",
    headers: { cookie: stranger.cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Stolen", kind: "slack" }),
  });
  expect(renamed.status).toBe(404);

  const viewer = await signUp(uniqueEmail());
  await authFor(db).api.addMember({
    body: { userId: viewer.user.id, role: "viewer", organizationId: orgId },
  });
  await request("/api/organization/switch", {
    method: "POST",
    headers: { cookie: viewer.cookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId: orgId }),
  });

  expect(
    (
      await saveChannel(viewer.cookie, {
        name: "Not mine to add",
        kind: "slack",
        webhookUrl: "https://example.com/hook",
      })
    ).status,
  ).toBe(403);

  const rows = await rowsOf(orgId, "Mine");
  expect(rows).toHaveLength(1);
  expect(rows[0]!.name).toBe("Mine");
});