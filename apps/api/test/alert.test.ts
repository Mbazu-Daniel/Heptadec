import { createServer } from "node:http";
import { and, eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { db, request, signUp, TEST_POSTGRES, uniqueEmail, uniqueSlug } from "./helpers";
import { runDueJobs } from "../src/modules/scheduler";

const {
  alertDelivery,
  alertRule,
  dataSource,
  notificationChannel,
  savedQuery,
  scheduledJob,
  widget,
} = schema;

const createdJobs: string[] = [];
const createdChannels: string[] = [];

afterAll(async () => {
  for (const id of createdJobs) {
    await db.delete(scheduledJob).where(eq(scheduledJob.id, id));
  }
  for (const id of createdChannels) {
    await db.delete(notificationChannel).where(eq(notificationChannel.id, id));
  }
});

const REGION_COUNTS =
  "SELECT region, count(*)::int AS events FROM events GROUP BY region ORDER BY region";

async function startReceiver(): Promise<{
  url: string;
  origin: string;
  paths: () => string[];
  bodies: () => string[];
  close: () => Promise<void>;
}> {
  const bodies: string[] = [];
  const paths: string[] = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      bodies.push(body);
      paths.push(request.url ?? "");
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}/services/T00000000/B00000000/webhooksecret`,
    origin: `http://127.0.0.1:${port}`,
    paths: () => [...paths],
    bodies: () => [...bodies],
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function waitForBodies(
  bodies: () => string[],
  attempts = 200,
): Promise<string[]> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (bodies().length > 0) {
      return bodies();
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return bodies();
}

async function ownerWithChart(): Promise<{
  cookie: string;
  orgId: string;
  savedQueryId: string;
}> {
  const { cookie } = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Alert Org", slug: uniqueSlug() },
    headers: { cookie },
  });

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
  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, org.id));

  const saved = await request(`/api/data-sources/${rows[0]!.id}/saved-queries`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Events per region", sql: REGION_COUNTS }),
  });
  const { savedQuery: created } = (await saved.json()) as { savedQuery: { id: string } };

  return { cookie, orgId: org.id, savedQueryId: created.id };
}

async function connectChannel(
  cookie: string,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await request("/api/notification-channels", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200 + 1);
  const { notificationChannel: placed } = (await res.json()) as {
    notificationChannel: { id: string };
  };
  createdChannels.push(placed.id);
}

async function rule(
  cookie: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return request("/api/alert-rules", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function runScheduledCheck(cookie: string, savedQueryId: string): Promise<void> {
  const created = await request("/api/scheduled-jobs", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ savedQueryId, name: "Check", cron: "* * * * *" }),
  });
  expect(created.status).toBe(201);
  const { scheduledJob: job } = (await created.json()) as { scheduledJob: { id: string } };
  createdJobs.push(job.id);

  await db
    .update(scheduledJob)
    .set({ nextRunAt: new Date(Date.now() - 60_000) })
    .where(eq(scheduledJob.id, job.id));

  await runDueJobs(db, new Date());
}

function deliveries(ruleId: string) {
  return db.select().from(alertDelivery).where(eq(alertDelivery.alertRuleId, ruleId));
}

async function ruleIdOf(savedQueryId: string): Promise<string> {
  const rows = await db
    .select()
    .from(alertRule)
    .where(eq(alertRule.savedQueryId, savedQueryId));
  return rows[0]!.id;
}

it("fires a breached threshold and reaches every channel that is connected", async () => {
  const receiver = await startReceiver();
  try {
    const { cookie, savedQueryId } = await ownerWithChart();
    await connectChannel(cookie, {
      name: "Chat",
      kind: "slack",
      webhookUrl: receiver.url,
      channel: "#alerts",
    });
    await connectChannel(cookie, {
      name: "Inbox",
      kind: "email",
      smtpHost: "smtp.invalid",
      smtpPort: 587,
      fromAddress: "alerts@example.com",
      recipients: ["ops@example.com"],
    });

    const created = await rule(cookie, {
      savedQueryId,
      name: "Busy regions",
      column: "events",
      operator: ">=",
      threshold: 1,
    });
    expect(created.status).toBe(201);
    await runScheduledCheck(cookie, savedQueryId);

    const posted = await waitForBodies(receiver.bodies);
    expect(posted).toHaveLength(1);
    const payload = JSON.parse(posted[0]!) as { channel: string; text: string };
    expect(payload.channel).toBe("#alerts");
    expect(payload.text).toContain("Busy regions");
    expect(payload.text).toContain("events >= 1");

    const rows = await deliveries(await ruleIdOf(savedQueryId));
    expect(rows).toHaveLength(2);
    const slack = rows.find((row) => row.channel === "slack")!;
    expect(slack.status).toBe("sent");
    expect(slack.error).toBeNull();
    expect(slack.message).toBe(payload.text);
    expect(rows.find((row) => row.channel === "email")!.status).toBe("failed");
  } finally {
    await receiver.close();
  }
});

it("stays quiet when the threshold holds", async () => {
  const receiver = await startReceiver();
  try {
    const { cookie, savedQueryId } = await ownerWithChart();
    await connectChannel(cookie, {
      name: "Chat",
      kind: "slack",
      webhookUrl: receiver.url,
    });

    const created = await rule(cookie, {
      savedQueryId,
      name: "Impossible",
      column: "events",
      operator: ">=",
      threshold: 1_000_000,
    });
    expect(created.status).toBe(201);

    await runScheduledCheck(cookie, savedQueryId);

    expect(await deliveries(await ruleIdOf(savedQueryId))).toHaveLength(0);
    expect(receiver.bodies()).toHaveLength(0);
  } finally {
    await receiver.close();
  }
});

it("records a breach that has nowhere to go instead of dropping it", async () => {
  const { cookie, savedQueryId } = await ownerWithChart();

  const created = await rule(cookie, {
    savedQueryId,
    name: "Nowhere",
    column: "events",
    operator: ">=",
    threshold: 1,
  });
  expect(created.status).toBe(201);

  await runScheduledCheck(cookie, savedQueryId);

  const rows = await deliveries(await ruleIdOf(savedQueryId));
  expect(rows).toHaveLength(1);
  expect(rows[0]!.channel).toBe("none");
  expect(rows[0]!.status).toBe("skipped");
  expect(rows[0]!.error).toBe("No notification channel is connected");
});

it("logs a channel that could not be reached without echoing its URL or token", async () => {
  const receiver = await startReceiver();
  const { url } = receiver;
  await receiver.close();

  const { cookie, savedQueryId } = await ownerWithChart();
  await connectChannel(cookie, {
    name: "Unreachable",
    kind: "slack",
    webhookUrl: url,
  });

  const created = await rule(cookie, {
    savedQueryId,
    name: "Unreachable",
    column: "events",
    operator: ">=",
    threshold: 1,
  });
  expect(created.status).toBe(201);

  await runScheduledCheck(cookie, savedQueryId);

  const rows = await deliveries(await ruleIdOf(savedQueryId));
  expect(rows).toHaveLength(1);
  expect(rows[0]!.status).toBe("failed");
  expect(rows[0]!.error).not.toContain(url);
  expect(JSON.stringify(rows[0]!)).not.toContain("webhooksecret");
});

it("refuses a rule that does not say what to watch", async () => {
  const { cookie, savedQueryId } = await ownerWithChart();

  for (const body of [
    { savedQueryId, column: "events", operator: ">=", threshold: 1 },
    { savedQueryId, name: "No column", operator: ">=", threshold: 1 },
    { savedQueryId, name: "Bad op", column: "events", operator: "==", threshold: 1 },
    { savedQueryId, name: "Bad t", column: "events", operator: ">=", threshold: "1" },
  ]) {
    const res = await rule(cookie, body);
    expect(res.status, JSON.stringify(body)).toBe(400);
  }

  const rows = await db.select().from(alertRule);
  expect(rows.filter((row) => row.savedQueryId === savedQueryId)).toHaveLength(0);
});

it("404s another organization's rule and clears the log when the query goes", async () => {
  const { cookie, savedQueryId } = await ownerWithChart();

  const created = await rule(cookie, {
    savedQueryId,
    name: "Mine",
    column: "events",
    operator: ">=",
    threshold: 1,
  });
  const { alertRule: placed } = (await created.json()) as { alertRule: { id: string } };

  const stranger = await signUp(uniqueEmail());
  await authFor(db).api.createOrganization({
    body: { name: "Stranger Org", slug: uniqueSlug() },
    headers: { cookie: stranger.cookie },
  });

  const removed = await request(`/api/alert-rules/${placed.id}`, {
    method: "DELETE",
    headers: { cookie: stranger.cookie },
  });
  expect(removed.status).toBe(404);
  expect(await deliveries(placed.id)).toHaveLength(0);
  const deleted = await request(`/api/saved-queries/${savedQueryId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  expect(deleted.status).toBe(200);

  const rules = await db
    .select()
    .from(alertRule)
    .where(eq(alertRule.id, placed.id));
  expect(rules).toHaveLength(0);
  expect(await deliveries(placed.id)).toHaveLength(0);

  const widgets = await db.select().from(widget);
  expect(widgets.filter((row) => row.savedQueryId === savedQueryId)).toHaveLength(0);
});

it("refuses a viewer who cannot add a rule", async () => {
  const { cookie, orgId, savedQueryId } = await ownerWithChart();

  const { user: viewer, cookie: viewerCookie } = await signUp(uniqueEmail());
  await authFor(db).api.addMember({
    body: { userId: viewer.id, role: "viewer", organizationId: orgId },
  });
  await request("/api/organization/switch", {
    method: "POST",
    headers: { cookie: viewerCookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId: orgId }),
  });

  const res = await rule(viewerCookie, {
    savedQueryId,
    name: "No",
    column: "events",
    operator: ">=",
    threshold: 1,
  });
  expect(res.status).toBe(403);

  const rows = await db
    .select()
    .from(alertRule)
    .where(
      and(
        eq(alertRule.savedQueryId, savedQueryId),
        eq(alertRule.organizationId, orgId),
      ),
    );
  expect(rows).toHaveLength(0);
});
it("marks a rule whose query nothing schedules, so it cannot look live", async () => {
  const { cookie, orgId, savedQueryId } = await ownerWithChart();

  const created = await rule(cookie, {
    savedQueryId,
    name: "Not scheduled",
    column: "events",
    operator: ">=",
    threshold: 1,
  });
  expect(created.status).toBe(201);
  const body = (await created.json()) as { alertRule: { id: string; scheduled: boolean } };
  expect(body.alertRule.scheduled).toBe(false);

  const stored = await db
    .select()
    .from(alertRule)
    .where(
      and(
        eq(alertRule.id, body.alertRule.id),
        eq(alertRule.organizationId, orgId),
      ),
    );
  expect(stored).toHaveLength(1);

  const listed = await request("/api/alert-rules", { headers: { cookie } });
  expect(listed.status).toBe(200);
  const { alertRules } = (await listed.json()) as {
    alertRules: Array<{ id: string; scheduled: boolean }>;
  };
  const unscheduled = alertRules.find((entry) => entry.id === body.alertRule.id);
  expect(unscheduled?.scheduled).toBe(false);

  // Scheduling the query is what makes the rule live, and nothing else changes.
  const job = await request("/api/scheduled-jobs", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ savedQueryId, name: "Check", cron: "* * * * *" }),
  });
  expect(job.status).toBe(201);
  const { scheduledJob: createdJob } = (await job.json()) as {
    scheduledJob: { id: string };
  };
  createdJobs.push(createdJob.id);

  const after = await request("/api/alert-rules", { headers: { cookie } });
  const { alertRules: afterRules } = (await after.json()) as {
    alertRules: Array<{ id: string; scheduled: boolean }>;
  };
  expect(afterRules.find((entry) => entry.id === body.alertRule.id)?.scheduled).toBe(true);
});
