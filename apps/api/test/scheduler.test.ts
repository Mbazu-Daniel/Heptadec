import { eq } from "drizzle-orm";
import { afterAll, expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { db, request, signUp, TEST_POSTGRES, uniqueEmail, uniqueSlug } from "./helpers";
import { runDueJobs, startScheduler } from "../src/modules/scheduler";

const { alertDelivery, dataSource, queryResult, savedQuery, scheduledJob } = schema;

const createdJobs: string[] = [];

afterAll(async () => {
  for (const id of createdJobs) {
    await db.delete(scheduledJob).where(eq(scheduledJob.id, id));
  }
});

const REGION_COUNTS =
  "SELECT region, count(*)::int AS events FROM events GROUP BY region ORDER BY region";
async function regionCounts(): Promise<Array<{ region: string; events: number }>> {
  const { default: pg } = await import("pg");
  const client = new pg.Client(TEST_POSTGRES);
  await client.connect();
  const res = await client.query(REGION_COUNTS);
  await client.end();
  return res.rows.map((row) => ({
    region: row.region as string,
    events: row.events as number,
  }));
}

async function ownerWithQuery(): Promise<{
  cookie: string;
  orgId: string;
  savedQueryId: string;
}> {
  const { cookie } = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Scheduler Org", slug: uniqueSlug() },
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
  const saved = await request(
    `/api/data-sources/${rows[0]!.id}/saved-queries`,
    {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Events per region", sql: REGION_COUNTS }),
    },
  );
  const { savedQuery: created } = (await saved.json()) as {
    savedQuery: { id: string };
  };
  return { cookie, orgId: org.id, savedQueryId: created.id };
}

async function schedule(
  cookie: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return request("/api/scheduled-jobs", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createSchedule(
  cookie: string,
  savedQueryId: string,
  fields: Record<string, unknown> = {},
): Promise<string> {
  const res = await schedule(cookie, {
    savedQueryId,
    name: "Hourly",
    cron: "* * * * *",
    ...fields,
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { scheduledJob: { id: string } };
  createdJobs.push(body.scheduledJob.id);
  return body.scheduledJob.id;
}

async function cacheRows(queryId: string): Promise<Array<typeof queryResult.$inferSelect>> {
  return db.select().from(queryResult).where(eq(queryResult.savedQueryId, queryId));
}

async function waitForCacheRow(
  queryId: string,
  attempts = 200,
): Promise<typeof queryResult.$inferSelect | undefined> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rows = await cacheRows(queryId);
    if (rows.length > 0) {
      return rows[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return undefined;
}

async function waitForSettledJob(
  jobId: string,
  attempts = 200,
): Promise<typeof scheduledJob.$inferSelect | undefined> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const rows = await db
      .select()
      .from(scheduledJob)
      .where(eq(scheduledJob.id, jobId));
    const row = rows[0];
    if (row !== undefined && row.lastRunAt !== null && row.leaseUntil === null) {
      return row;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return undefined;
}

it("persists a schedule with the next run computed from its cron and timezone", async () => {
  const { cookie, orgId, savedQueryId } = await ownerWithQuery();

  const id = await createSchedule(cookie, savedQueryId, {
    cron: "0 9 * * *",
    timezone: "Europe/Berlin",
    ttlSeconds: 900,
  });

  const rows = await db
    .select()
    .from(scheduledJob)
    .where(eq(scheduledJob.id, id));
  expect(rows).toHaveLength(1);
  expect(rows[0]!.organizationId).toBe(orgId);
  expect(rows[0]!.savedQueryId).toBe(savedQueryId);
  expect(rows[0]!.cron).toBe("0 9 * * *");
  expect(rows[0]!.timezone).toBe("Europe/Berlin");
  expect(rows[0]!.ttlSeconds).toBe(900);
  const nextRunAt = rows[0]!.nextRunAt.getTime();
  expect(nextRunAt).toBeGreaterThan(Date.now());
  expect(nextRunAt).toBeLessThan(Date.now() + 24 * 60 * 60 * 1000);
  const berlinHour = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(rows[0]!.nextRunAt);
  expect(berlinHour).toBe("09:00");
});

it("runs a due job on the timer and populates the cache", async () => {
  const { cookie, savedQueryId } = await ownerWithQuery();
  const id = await createSchedule(cookie, savedQueryId, { cron: "* * * * *" });
  await db
    .update(scheduledJob)
    .set({ nextRunAt: new Date(Date.now() - 60_000) })
    .where(eq(scheduledJob.id, id));

  const stop = startScheduler(db, 20);
  try {
    const cached = await waitForCacheRow(savedQueryId);
    expect(cached).toBeDefined();

    const grid = JSON.parse(cached!.payload) as {
      columns: string[];
      rows: Array<{ region: string; events: number }>;
      rowCount: number;
    };
    expect(grid.columns).toEqual(["region", "events"]);
    expect(grid.rows).toEqual(await regionCounts());
    expect(grid.rowCount).toBe(grid.rows.length);
    expect(cached!.organizationId).toBe(
      (await db.select().from(savedQuery).where(eq(savedQuery.id, savedQueryId)))[0]!
        .organizationId,
    );
  } finally {
    stop();
  }
  const after = await waitForSettledJob(id);
  expect(after).toBeDefined();
  expect(after!.lastRunAt).not.toBeNull();
  expect(after!.leaseUntil).toBeNull();
  expect(after!.nextRunAt.getTime()).toBeGreaterThan(Date.now());
});

it("evaluates the alert rules watching a query when its job runs", async () => {
  const { cookie, savedQueryId } = await ownerWithQuery();
  const made = await request("/api/alert-rules", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      savedQueryId,
      name: "Busy regions",
      column: "events",
      operator: ">=",
      threshold: 1,
    }),
  });
  expect(made.status).toBe(201);
  const { alertRule: placed } = (await made.json()) as {
    alertRule: { id: string };
  };

  const id = await createSchedule(cookie, savedQueryId, { cron: "* * * * *" });
  await db
    .update(scheduledJob)
    .set({ nextRunAt: new Date(Date.now() - 60_000) })
    .where(eq(scheduledJob.id, id));

  await runDueJobs(db, new Date());

  // Nothing is connected to receive it, so the breach is recorded rather than
  // sent — which is the whole of what a run does about alerts.
  const rows = await db
    .select()
    .from(alertDelivery)
    .where(eq(alertDelivery.alertRuleId, placed.id));
  expect(rows).toHaveLength(1);
  expect(rows[0]!.status).toBe("skipped");
});

it("skips a job another runner holds, and runs it once the lease is clear", async () => {
  const { cookie, savedQueryId } = await ownerWithQuery();
  const id = await createSchedule(cookie, savedQueryId);
  const now = new Date();

  await db
    .update(scheduledJob)
    .set({
      nextRunAt: new Date(now.getTime() - 60_000),
      leaseUntil: new Date(now.getTime() + 60_000),
    })
    .where(eq(scheduledJob.id, id));

  await runDueJobs(db, now);
  expect(await cacheRows(savedQueryId)).toHaveLength(0);
  await db
    .update(scheduledJob)
    .set({ leaseUntil: new Date(now.getTime() - 1_000) })
    .where(eq(scheduledJob.id, id));

  await runDueJobs(db, new Date());
  expect(await cacheRows(savedQueryId)).toHaveLength(1);
});

it("keeps ticking when a stored schedule cannot be read", async () => {
  const { cookie, savedQueryId } = await ownerWithQuery();
  const broken = await createSchedule(cookie, savedQueryId, { name: "Broken row" });
  const healthy = await createSchedule(cookie, savedQueryId, { name: "Healthy row" });

  const now = Date.now();
  await db
    .update(scheduledJob)
    .set({ cron: "not a cron", nextRunAt: new Date(now - 120_000) })
    .where(eq(scheduledJob.id, broken));
  await db
    .update(scheduledJob)
    .set({ nextRunAt: new Date(now - 60_000) })
    .where(eq(scheduledJob.id, healthy));

  await runDueJobs(db, new Date());

  const rows = await db
    .select()
    .from(scheduledJob)
    .where(eq(scheduledJob.savedQueryId, savedQueryId));
  const brokenRow = rows.find((row) => row.id === broken)!;
  const healthyRow = rows.find((row) => row.id === healthy)!;

  expect(brokenRow.leaseUntil).toBeNull();
  expect(brokenRow.nextRunAt.getTime()).toBeGreaterThan(now);
  expect(healthyRow.lastRunAt).not.toBeNull();
});

it("refuses a schedule it could not honour and writes nothing", async () => {
  const { cookie, savedQueryId } = await ownerWithQuery();

  for (const fields of [
    { cron: "not a cron" },
    { cron: "0 9 * *" },
    { cron: "0 9 * * *", timezone: "Nope/Nope" },
    { cron: "0 0 30 2 *" },
  ]) {
    const res = await schedule(cookie, { savedQueryId, name: "Broken", ...fields });
    expect(res.status, JSON.stringify(fields)).toBe(400);
  }

  const jobs = await db.select().from(scheduledJob);
  expect(jobs.filter((job) => job.savedQueryId === savedQueryId)).toHaveLength(0);
});

it("refuses scheduling a query on a source that cannot answer it", async () => {
  const { cookie, orgId } = await ownerWithQuery();

  const source = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "redis",
      name: "Cache",
      host: "127.0.0.1",
      port: 6381,
    }),
  });
  expect(source.status).toBe(200);
  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, orgId));

  const saved = await request(`/api/data-sources/${rows[0]!.id}/saved-queries`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Keys", sql: "KEYS *" }),
  });
  expect(saved.status).toBe(201);
  const { savedQuery: created } = (await saved.json()) as { savedQuery: { id: string } };

  const res = await schedule(cookie, { savedQueryId: created.id, name: "Hourly" });
  expect(res.status).toBe(400);

  const jobs = await db.select().from(scheduledJob);
  expect(jobs.filter((job) => job.savedQueryId === created.id)).toHaveLength(0);
});

it("404s another organization's schedule", async () => {
  const { cookie, savedQueryId } = await ownerWithQuery();
  const id = await createSchedule(cookie, savedQueryId);

  const stranger = await signUp(uniqueEmail());
  await authFor(db).api.createOrganization({
    body: { name: "Stranger Org", slug: uniqueSlug() },
    headers: { cookie: stranger.cookie },
  });

  const removed = await request(`/api/scheduled-jobs/${id}`, {
    method: "DELETE",
    headers: { cookie: stranger.cookie },
  });
  expect(removed.status).toBe(404);

  const rows = await db
    .select()
    .from(scheduledJob)
    .where(eq(scheduledJob.id, id));
  expect(rows).toHaveLength(1);
});

it("removes the schedule when the saved query goes", async () => {
  const { cookie, savedQueryId } = await ownerWithQuery();
  const id = await createSchedule(cookie, savedQueryId);

  const res = await request(`/api/saved-queries/${savedQueryId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(scheduledJob)
    .where(eq(scheduledJob.id, id));
  expect(rows).toHaveLength(0);
});
