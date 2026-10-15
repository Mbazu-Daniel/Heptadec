import { and, eq, isNull, lte, or } from "drizzle-orm";
import type { Column } from "drizzle-orm";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import type { IOrganizationScope } from "../../common/session/current-organization";
import { checkAlerts } from "../alert/evaluate";
import { materializeResult } from "../query-result/cache";
import { nextRunAfter, parseCron } from "./cron";

const { scheduledJob } = schema;

const LEASE_MS = 5 * 60_000;

const MAX_JOBS_PER_TICK = 20;

type IJob = typeof scheduledJob.$inferSelect;

export async function runDueJobs(db: HeptadecDatabase, now: Date): Promise<void> {
  const due = await db
    .select()
    .from(scheduledJob)
    .where(lte(scheduledJob.nextRunAt, now))
    .orderBy(scheduledJob.nextRunAt)
    .limit(MAX_JOBS_PER_TICK);

  for (const job of due) {
    if (!(await claim(db, job, now))) {
      continue;
    }
    await runOne(db, job, now);
  }
}

async function claim(db: HeptadecDatabase, job: IJob, now: Date): Promise<boolean> {
  const claimed = await db
    .update(scheduledJob)
    .set({ leaseUntil: new Date(now.getTime() + LEASE_MS), updatedAt: now })
    .where(
      and(
        eq(scheduledJob.id, job.id),
        or(isNull(scheduledJob.leaseUntil), lte(scheduledJob.leaseUntil, now)),
      ),
    )
    .returning({ id: scheduledJob.id });
  return claimed.length > 0;
}

async function runOne(
  db: HeptadecDatabase,
  job: IJob,
  now: Date,
): Promise<void> {
  const organization: IOrganizationScope = {
    organizationId: job.organizationId,
    db,
    where: (column: Column) => eq(column, job.organizationId),
  };

  try {
    const grid = await materializeResult(job.savedQueryId, organization, job.ttlSeconds);
    await checkAlerts(db, job.savedQueryId, job.organizationId, grid);
  } catch (caught) {
    console.error(`[scheduler] job ${job.id} (${job.name}) failed:`, caught);
  }

  await db
    .update(scheduledJob)
    .set({
      nextRunAt: nextRunOrRetry(job, now),
      lastRunAt: now,
      leaseUntil: null,
      updatedAt: now,
    })
    .where(eq(scheduledJob.id, job.id));
}

const RETRY_MS = 5 * 60_000;

function nextRunOrRetry(job: IJob, now: Date): Date {
  try {
    return nextRunFor(job, now);
  } catch (caught) {
    console.error(`[scheduler] job ${job.id} has an unreadable schedule:`, caught);
    return new Date(now.getTime() + RETRY_MS);
  }
}

export function nextRunFor(
  job: { cron: string; timezone: string; organizationId: string },
  from: Date,
): Date {
  const next = nextRunAfter(parseCron(job.cron), job.timezone, from);
  return new Date(next.getTime() + organizationOffset(job.organizationId) * 1_000);
}

function organizationOffset(organizationId: string): number {
  let hash = 2166136261;
  for (const char of organizationId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % 60;
}

export function startScheduler(db: HeptadecDatabase, tickMs: number): () => void {
  const timer = setInterval(() => {
    void runDueJobs(db, new Date()).catch((caught: unknown) => {
      console.error("[scheduler] tick failed:", caught);
    });
  }, tickMs);
  timer.unref();
  return () => clearInterval(timer);
}
