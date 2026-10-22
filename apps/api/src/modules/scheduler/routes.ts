import {
  Hono,
} from "hono";
import {
  and,
  eq,
} from "drizzle-orm";
import {
  schema,
} from "@heptadec/db";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  readBody,
  readOptionalString,
  readString,
} from "../../common/http/body";
import {
  activeOrganization,
  oneRow,
} from "../../common/session/current-organization";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions";
import {
  can,
} from "../rbac/authorize";
import {
  recordAudit,
  auditActor,
} from "../audit";
import {
  canBeSaved,
  engineOf,
} from "../data-source/engines";
import {
  DEFAULT_TTL_SECONDS,
} from "../query-result/cache";
import {
  isTimezone,
} from "./cron";
import {
  nextRunFor,
} from "./runner";
import {
  DEFAULT_TIMEZONE,
  MAX_TTL_SECONDS,
  MIN_TTL_SECONDS,
  type IScheduledJob,
  type IScheduledJobListResponse,
  type IScheduledJobResponse,
} from "./contracts";

const { dataSource, savedQuery, scheduledJob } = schema;

const MAX_NAME = 120;

const MAX_CRON = 100;

const MAX_TIMEZONE = 64;

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

export function schedulerRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/scheduled-jobs", requireSession, async (c) => {
    const organization = activeOrganization(c);

    const rows = await organization.db
      .select({
        job: scheduledJob,
        savedQueryName: savedQuery.name,
      })
      .from(scheduledJob)
      .innerJoin(savedQuery, eq(scheduledJob.savedQueryId, savedQuery.id))
      .where(organization.where(scheduledJob.organizationId))
      .orderBy(scheduledJob.nextRunAt);

    const body: IScheduledJobListResponse = {
      scheduledJobs: rows.map((row) => toScheduledJob(row.job, row.savedQueryName)),
    };
    return c.json(body);
  });

  routes.post("/api/scheduled-jobs", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "schedule", "create"))) {
      throw new ForbiddenException("Only owners and editors can schedule queries");
    }

    const body = readBody(await c.req.json(), "A schedule is required");
    const request = readCreateRequest(body);

    const query = await oneRow(organization.db, savedQuery, request.savedQueryId, organization);
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
    if (!isTimezone(request.timezone)) {
      throw new BadRequestException("That timezone is not an IANA zone");
    }

    const now = new Date();
    const inserted = await organization.db
      .insert(scheduledJob)
      .values({
        organizationId: organization.organizationId,
        savedQueryId: query.id,
        name: request.name,
        cron: request.cron,
        timezone: request.timezone,
        ttlSeconds: request.ttlSeconds,
        nextRunAt: nextRunFor(
          { cron: request.cron, timezone: request.timezone, organizationId: organization.organizationId },
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

    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "scheduled_job.created",
      targetKind: "scheduled_job",
      targetId: created.id,
      targetLabel: created.name,
    });
    const response: IScheduledJobResponse = {
      scheduledJob: toScheduledJob(created, query.name),
    };
    return c.json(response, 201);
  });

  routes.put("/api/scheduled-jobs/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "schedule", "update"))) {
      throw new ForbiddenException("Only owners and editors can change schedules");
    }

    const found = await oneRow(organization.db, scheduledJob, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That schedule does not exist");
    }
    const query = await oneRow(organization.db, savedQuery, found.savedQueryId, organization);
    if (query === undefined) {
      throw new NotFoundException("That saved query does not exist");
    }

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

    const now = new Date();
    const updated = await organization.db
      .update(scheduledJob)
      .set({
        name,
        cron,
        timezone,
        ttlSeconds,
        nextRunAt: nextRunFor(
          { cron, timezone, organizationId: organization.organizationId },
          now,
        ),
        leaseUntil: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(scheduledJob.id, found.id),
          organization.where(scheduledJob.organizationId),
        ),
      )
      .returning();

    const edited = updated[0];
    if (edited === undefined) {
      throw new NotFoundException("That schedule could not be changed");
    }

    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "scheduled_job.updated",
      targetKind: "scheduled_job",
      targetId: edited.id,
      targetLabel: edited.name,
    });
    const response: IScheduledJobResponse = {
      scheduledJob: toScheduledJob(edited, query.name),
    };
    return c.json(response);
  });

  routes.delete("/api/scheduled-jobs/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "schedule", "delete"))) {
      throw new ForbiddenException("Only owners and editors can remove schedules");
    }

    const removed = await organization.db
      .delete(scheduledJob)
      .where(
        and(
          eq(scheduledJob.id, c.req.param("id")),
          organization.where(scheduledJob.organizationId),
        ),
      )
      .returning({ id: scheduledJob.id, name: scheduledJob.name });

    if (removed.length === 0) {
      throw new NotFoundException("That schedule does not exist");
    }
    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "scheduled_job.deleted",
      targetKind: "scheduled_job",
      targetId: removed[0]!.id,
      targetLabel: removed[0]!.name,
    });
    return c.json({ id: removed[0]!.id });
  });

  return routes;
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

interface IScheduleFields {
  savedQueryId: string;
  name: string;
  cron: string;
  timezone: string;
  ttlSeconds: number;
}
