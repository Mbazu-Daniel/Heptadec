import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@heptadec/db";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { readBody, readString } from "../../common/http/body";
import {
  activeOrganization,
  oneRow,
} from "../../common/session/current-organization";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions";
import { can } from "../rbac/authorize";
import { recordAudit, auditActor } from "../audit";
import {
  isAlertOperator,
  type AlertOperator,
  type IAlertDeliveryListResponse,
  type IAlertRule,
  type IAlertRuleListResponse,
  type IAlertRuleResponse,
} from "./contracts";
import { checkRunAlerts } from "./evaluate";
import { toAlertDelivery } from "./deliver";
import { DEFAULT_TTL_SECONDS } from "../query-result/cache";

const { alertDelivery, alertRule, savedQuery, scheduledJob } = schema;

const MAX_NAME = 120;

const MAX_COLUMN = 128;

const MAX_EMAIL = 254;

const MAX_URL = 2_048;

const LOG_LIMIT = 50;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function toAlertRule(
  row: typeof alertRule.$inferSelect,
  scheduled: boolean,
): IAlertRule {
  return {
    id: row.id,
    savedQueryId: row.savedQueryId,
    name: row.name,
    column: row.column,
    operator: row.operator as AlertOperator,
    threshold: row.threshold,
    scheduled,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function alertRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/alert-rules", requireSession, async (c) => {
    const organization = activeOrganization(c);

    const rows = await organization.db
      .select()
      .from(alertRule)
      .where(organization.where(alertRule.organizationId))
      .orderBy(desc(alertRule.createdAt));

    const running = await organization.db
      .selectDistinct({ savedQueryId: scheduledJob.savedQueryId })
      .from(scheduledJob)
      .where(organization.where(scheduledJob.organizationId));

    const scheduled = new Set(running.map((job) => job.savedQueryId));
    const body: IAlertRuleListResponse = {
      alertRules: rows.map((row) =>
        toAlertRule(row, scheduled.has(row.savedQueryId)),
      ),
    };
    return c.json(body);
  });

  routes.post("/api/alert-rules", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "schedule", "create"))) {
      throw new ForbiddenException("Only owners and editors can add alert rules");
    }

    const body = readBody(await c.req.json(), "An alert rule is required");
    const savedQueryId = readString(body, "savedQueryId", "Pick the query to watch", 64);
    const query = await oneRow(organization.db, savedQuery, savedQueryId, organization);
    if (query === undefined) {
      throw new NotFoundException("That saved query does not exist");
    }

    const name = readString(body, "name", "Give the alert a name", MAX_NAME);
    const column = readString(body, "column", "Pick the column to watch", MAX_COLUMN);

    const operatorValue = readString(body, "operator", "Pick an operator", 8);
    if (!isAlertOperator(operatorValue)) {
      throw new BadRequestException("Pick one of >, >=, <, <= or =");
    }
    const operator: AlertOperator = operatorValue;

    const threshold = body.threshold;
    if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
      throw new BadRequestException("The threshold must be a number");
    }

    const now = new Date();
    const inserted = await organization.db
      .insert(alertRule)
      .values({
        organizationId: organization.organizationId,
        savedQueryId,
        name,
        column,
        operator,
        threshold,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const created = inserted[0];
    if (created === undefined) {
      throw new NotFoundException("That alert rule could not be created");
    }
    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "alert_rule.created",
      targetKind: "alert_rule",
      targetId: created.id,
      targetLabel: created.name,
    });
    const running = await organization.db
      .select({ id: scheduledJob.id })
      .from(scheduledJob)
      .where(
        and(
          eq(scheduledJob.savedQueryId, savedQueryId),
          organization.where(scheduledJob.organizationId),
        ),
      )
      .limit(1);

    const response: IAlertRuleResponse = {
      alertRule: toAlertRule(created, running.length > 0),
    };
    return c.json(response, 201);
  });

  routes.delete("/api/alert-rules/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "schedule", "delete"))) {
      throw new ForbiddenException("Only owners and editors can remove alert rules");
    }

    const found = await oneRow(organization.db, alertRule, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That alert rule does not exist");
    }
    await organization.db
      .delete(alertDelivery)
      .where(
        and(
          eq(alertDelivery.alertRuleId, found.id),
          organization.where(alertDelivery.organizationId),
        ),
      );
    await organization.db.delete(alertRule).where(eq(alertRule.id, found.id));
    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "alert_rule.deleted",
      targetKind: "alert_rule",
      targetId: found.id,
      targetLabel: found.name,
    });
    return c.json({ id: found.id });
  });
  routes.get("/api/alert-deliveries", requireSession, async (c) => {
    const organization = activeOrganization(c);

    const rows = await organization.db
      .select()
      .from(alertDelivery)
      .where(organization.where(alertDelivery.organizationId))
      .orderBy(desc(alertDelivery.createdAt))
      .limit(LOG_LIMIT);

    const body: IAlertDeliveryListResponse = {
      alertDeliveries: rows.map(toAlertDelivery),
    };
    return c.json(body);
  });

  /**
   * A check, on demand, of the alerts watching one saved query — the same
   * operation a due job does about them, so a breach reaching every channel is
   * something the app can be asked for rather than only something a tick can
   * produce. Answers with the deliveries this run wrote.
   */
  routes.post("/api/saved-queries/:id/alert-checks", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "schedule", "create"))) {
      throw new ForbiddenException("Only owners and editors can check a query's alerts");
    }

    const query = await oneRow(
      organization.db,
      savedQuery,
      c.req.param("id"),
      organization,
    );
    if (query === undefined) {
      throw new NotFoundException("That saved query does not exist");
    }

    const body: IAlertDeliveryListResponse = {
      alertDeliveries: await checkRunAlerts(
        query.id,
        organization,
        DEFAULT_TTL_SECONDS,
      ),
    };
    return c.json(body);
  });

  return routes;
}
