import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import {
  readBody,
  readOptionalString,
  readString,
} from "../../common/http/body";
import {
  activeOrganization,
} from "../../common/session/current-organization";
import {
  BadRequestException,
  ForbiddenException,
} from "../../common/exceptions/index";
import {
  can,
} from "../rbac/authorize";
import { recordAudit } from "../audit/index";
import { DEFAULT_TTL_SECONDS } from "../query-result/cache";
import { isTimezone } from "./cron";
import {
  createScheduledJob,
  deleteScheduledJob,
  getScheduledJobForUpdate,
  listScheduledJobs,
  updateScheduledJob,
} from "./scheduler.service";
import {
  DEFAULT_TIMEZONE,
  MAX_TTL_SECONDS,
  MIN_TTL_SECONDS,
} from "./contracts";
import type { IScheduleFields } from "./types";

const MAX_NAME = 120;

const MAX_CRON = 100;

const MAX_TIMEZONE = 64;

export async function listScheduledJobsHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  return c.json(await listScheduledJobs(organization));
}

export async function createScheduledJobHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "schedule", "create"))) {
    throw new ForbiddenException("Only owners and editors can schedule queries");
  }

  const body = readBody(await c.req.json(), "A schedule is required");
  const request = readCreateRequest(body);

  const response = await createScheduledJob(organization, request);
  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "scheduled_job.created",
    targetKind: "scheduled_job",
    targetId: response.scheduledJob.id,
    targetLabel: response.scheduledJob.name,
  });
  return c.json(response, 201);
}

export async function updateScheduledJobHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/scheduled-jobs/:id">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "schedule", "update"))) {
    throw new ForbiddenException("Only owners and editors can change schedules");
  }

  await getScheduledJobForUpdate(organization, c.req.param("id"));

  const body = readBody(await c.req.json(), "A schedule change is required");
  const name = readString(body, "name", "Give the schedule a name", MAX_NAME);
  const cron = readString(body, "cron", "Write a five-field schedule", MAX_CRON);
  const timezone =
    readOptionalString(body, "timezone", "Pick a timezone", MAX_TIMEZONE) ??
    DEFAULT_TIMEZONE;
  if (!isTimezone(timezone)) {
    throw new BadRequestException("That timezone is not an IANA zone");
  }
  const ttlSeconds = readTtlSeconds(body.ttlSeconds);

  const response = await updateScheduledJob(organization, c.req.param("id"), {
    name,
    cron,
    timezone,
    ttlSeconds,
  });
  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "scheduled_job.updated",
    targetKind: "scheduled_job",
    targetId: response.scheduledJob.id,
    targetLabel: response.scheduledJob.name,
  });
  return c.json(response);
}

export async function deleteScheduledJobHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/scheduled-jobs/:id">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "schedule", "delete"))) {
    throw new ForbiddenException("Only owners and editors can remove schedules");
  }

  const removed = await deleteScheduledJob(organization, c.req.param("id"));
  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "scheduled_job.deleted",
    targetKind: "scheduled_job",
    targetId: removed.id,
    targetLabel: removed.name,
  });
  return c.json({ id: removed.id });
}

function readTtlSeconds(value: unknown): number {
  if (value === undefined || value === null) {
    return DEFAULT_TTL_SECONDS;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < MIN_TTL_SECONDS ||
    value > MAX_TTL_SECONDS
  ) {
    throw new BadRequestException(
      `The freshness window must be between ${MIN_TTL_SECONDS} and ${MAX_TTL_SECONDS} seconds`,
    );
  }
  return value;
}

function readCreateRequest(body: Record<string, unknown>): IScheduleFields {
  const ttlSeconds = readTtlSeconds(body.ttlSeconds);

  return {
    savedQueryId: readString(body, "savedQueryId", "Pick the query to schedule", 64),
    name: readString(body, "name", "Give the schedule a name", MAX_NAME),
    cron: readString(body, "cron", "Write a five-field schedule", MAX_CRON),
    timezone:
      readOptionalString(body, "timezone", "Pick a timezone", MAX_TIMEZONE) ??
      DEFAULT_TIMEZONE,
    ttlSeconds,
  };
}
