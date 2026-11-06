import { and, eq } from "drizzle-orm";
import {
  dataSource,
  savedQuery,
  scheduledJob,
} from "@heptadec/db";
import type { IOrganizationScope } from "../../common/session/current-organization";
import { oneRow } from "../../common/session/current-organization";
import {
  BadRequestException,
  NotFoundException,
} from "../../common/exceptions/index";
import { canBeSaved, engineOf } from "../data-source/engines";
import { isTimezone } from "./cron";
import { nextRunFor } from "./runner";
import type {
  IScheduledJob,
  IScheduledJobListResponse,
  IScheduledJobResponse,
} from "./contracts";
import type {
  ICreateScheduledJobInput,
  IScheduledJobForUpdate,
  IUpdateScheduledJobInput,
} from "./types";

function toScheduledJob(
  row: typeof scheduledJob.$inferSelect,
  savedQueryName: string,
): IScheduledJob {
  return {
    id: row.id,
    savedQueryId: row.savedQueryId,
    savedQueryName,
    name: row.name,
    cron: row.cron,
    timezone: row.timezone,
    ttlSeconds: row.ttlSeconds,
    nextRunAt: row.nextRunAt.toISOString(),
    lastRunAt: row.lastRunAt === null ? null : row.lastRunAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listScheduledJobs(
  organization: IOrganizationScope,
): Promise<IScheduledJobListResponse> {
  const rows = await organization.db
    .select({
      job: scheduledJob,
      savedQueryName: savedQuery.name,
    })
    .from(scheduledJob)
    .innerJoin(savedQuery, eq(scheduledJob.savedQueryId, savedQuery.id))
    .where(organization.where(scheduledJob.organizationId))
    .orderBy(scheduledJob.nextRunAt);

  return {
    scheduledJobs: rows.map((row) => toScheduledJob(row.job, row.savedQueryName)),
  };
}

export async function createScheduledJob(
  organization: IOrganizationScope,
  input: ICreateScheduledJobInput,
): Promise<IScheduledJobResponse> {
  const query = await oneRow(organization.db, savedQuery, input.savedQueryId, organization);
  if (query === undefined) {
    throw new NotFoundException("That saved query does not exist");
  }
  const source = await oneRow(organization.db, dataSource, query.dataSourceId, organization);
  if (source === undefined) {
    throw new NotFoundException("That data source does not exist");
  }
  const engine = engineOf(source);
  if (!canBeSaved(source)) {
    throw new BadRequestException(
      `${engine.name} sources cannot be scheduled`,
    );
  }
  if (!isTimezone(input.timezone)) {
    throw new BadRequestException("That timezone is not an IANA zone");
  }

  const now = new Date();
  const inserted = await organization.db
    .insert(scheduledJob)
    .values({
      organizationId: organization.organizationId,
      savedQueryId: query.id,
      name: input.name,
      cron: input.cron,
      timezone: input.timezone,
      ttlSeconds: input.ttlSeconds,
      nextRunAt: nextRunFor(
        { cron: input.cron, timezone: input.timezone, organizationId: organization.organizationId },
        now,
      ),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const created = inserted[0];
  if (created === undefined) {
    throw new NotFoundException("That schedule could not be created");
  }

  return {
    scheduledJob: toScheduledJob(created, query.name),
  };
}

export async function getScheduledJobForUpdate(
  organization: IOrganizationScope,
  id: string,
): Promise<IScheduledJobForUpdate> {
  const job = await oneRow(organization.db, scheduledJob, id, organization);
  if (job === undefined) {
    throw new NotFoundException("That schedule does not exist");
  }
  const query = await oneRow(organization.db, savedQuery, job.savedQueryId, organization);
  if (query === undefined) {
    throw new NotFoundException("That saved query does not exist");
  }
  return { job, savedQueryName: query.name };
}

export async function updateScheduledJob(
  organization: IOrganizationScope,
  id: string,
  input: IUpdateScheduledJobInput,
): Promise<IScheduledJobResponse> {
  const now = new Date();
  const updated = await organization.db
    .update(scheduledJob)
    .set({
      name: input.name,
      cron: input.cron,
      timezone: input.timezone,
      ttlSeconds: input.ttlSeconds,
      nextRunAt: nextRunFor(
        { cron: input.cron, timezone: input.timezone, organizationId: organization.organizationId },
        now,
      ),
      leaseUntil: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(scheduledJob.id, id),
        organization.where(scheduledJob.organizationId),
      ),
    )
    .returning();

  const edited = updated[0];
  if (edited === undefined) {
    throw new NotFoundException("That schedule could not be changed");
  }

  const query = await oneRow(organization.db, savedQuery, edited.savedQueryId, organization);
  if (query === undefined) {
    throw new NotFoundException("That saved query does not exist");
  }

  return {
    scheduledJob: toScheduledJob(edited, query.name),
  };
}

export async function deleteScheduledJob(
  organization: IOrganizationScope,
  id: string,
): Promise<{ id: string; name: string }> {
  const removed = await organization.db
    .delete(scheduledJob)
    .where(
      and(
        eq(scheduledJob.id, id),
        organization.where(scheduledJob.organizationId),
      ),
    )
    .returning({ id: scheduledJob.id, name: scheduledJob.name });

  if (removed.length === 0) {
    throw new NotFoundException("That schedule does not exist");
  }
  return { id: removed[0]!.id, name: removed[0]!.name };
}
