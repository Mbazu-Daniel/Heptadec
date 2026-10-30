import { and, eq, isNull, lte, or } from "drizzle-orm";
import {
  scheduledJob,
  schedulerLease,
  type HeptadecDatabase,
} from "@heptadec/db";
import { organizationScope } from "../../common/session/current-organization";
import { checkRunAlerts } from "../alert/evaluate";
import { entitlementFor, type IEntitlement } from "../billing/entitlement";
import { checkBillingReminders } from "../billing/reminder";
import { checkBillingRenewals } from "../billing/renewal";
import { nextRunAfter, parseCron } from "./cron";

const LEASE_MS = 5 * 60_000;

const MAX_JOBS_PER_TICK = 20;

const BILLING_SWEEP_LEASE = "billing-sweep";

const BILLING_SWEEP_MS = 15 * 60_000;

type IJob = typeof scheduledJob.$inferSelect;

export async function runSchedulerTick(
  db: HeptadecDatabase,
  now: Date,
): Promise<void> {
  await runSchedules(db, now);
  await runSweeps(db, now);
}

async function runSchedules(db: HeptadecDatabase, now: Date): Promise<void> {
  const due = await db
    .select()
    .from(scheduledJob)
    .where(lte(scheduledJob.nextRunAt, now))
    .orderBy(scheduledJob.nextRunAt)
    .limit(MAX_JOBS_PER_TICK);

  for (const job of due) {
    if (!(await claimJob(db, job, now))) {
      continue;
    }
    const entitlement = await entitlementFor(db, job.organizationId);
    await runOne(db, job, now, entitlement);
  }
}

async function runSweeps(db: HeptadecDatabase, now: Date): Promise<void> {
  if (!(await claimLease(db, BILLING_SWEEP_LEASE, now, BILLING_SWEEP_MS))) {
    return;
  }
  await checkBillingRenewals(db, now);
  await checkBillingReminders(db, now);
}

async function claimJob(
  db: HeptadecDatabase,
  job: IJob,
  now: Date,
): Promise<boolean> {
  const claimed = await db
    .update(scheduledJob)
    .set({ leaseUntil: until(now, LEASE_MS), updatedAt: now })
    .where(
      and(
        eq(scheduledJob.id, job.id),
        or(isNull(scheduledJob.leaseUntil), lte(scheduledJob.leaseUntil, now)),
      ),
    )
    .returning({ id: scheduledJob.id });
  return claimed.length > 0;
}

async function claimLease(
  db: HeptadecDatabase,
  name: string,
  now: Date,
  durationMs: number,
): Promise<boolean> {
  const renewed = await db
    .update(schedulerLease)
    .set({ leaseUntil: until(now, durationMs) })
    .where(
      and(
        eq(schedulerLease.name, name),
        lte(schedulerLease.leaseUntil, now),
      ),
    )
    .returning({ name: schedulerLease.name });
  if (renewed.length > 0) {
    return true;
  }
  const created = await db
    .insert(schedulerLease)
    .values({ name, leaseUntil: until(now, durationMs) })
    .onConflictDoNothing()
    .returning({ name: schedulerLease.name });
  return created.length > 0;
}

function until(now: Date, durationMs: number): Date {
  return new Date(now.getTime() + durationMs);
}

async function runOne(
  db: HeptadecDatabase,
  job: IJob,
  now: Date,
  entitlement: IEntitlement,
): Promise<void> {
  const organization = organizationScope(db, job.organizationId);

  try {
    if (entitlement.entitled) {
      await checkRunAlerts(job.savedQueryId, organization, job.ttlSeconds);
    }
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
  let running = false;
  const timer = setInterval(() => {
    if (running) {
      return;
    }
    running = true;
    void runSchedulerTick(db, new Date())
      .catch((caught: unknown) => {
        console.error("[scheduler] tick failed:", caught);
      })
      .finally(() => {
        running = false;
      });
  }, tickMs);
  timer.unref();
  return () => clearInterval(timer);
}
