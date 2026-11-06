import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import { readBody, readString } from "../../common/http/body";
import {
  BadRequestException,
  ForbiddenException,
} from "../../common/exceptions/index";
import { can } from "../rbac/authorize";
import { recordAudit } from "../audit/index";
import {
  isAlertOperator,
  type AlertOperator,
  type IAlertRuleResponse,
} from "./contracts";
import {
  createAlertRule,
  deleteAlertRule,
  listAlertDeliveries,
  listAlertRules,
  runAlertChecks,
  updateAlertRule,
} from "./alert.service";

const MAX_NAME = 120;

const MAX_COLUMN = 128;

export async function listAlertRulesHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  return c.json(await listAlertRules(organization));
}

export async function createAlertRuleHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "schedule", "create"))) {
    throw new ForbiddenException("Only owners and editors can add alert rules");
  }

  const body = readBody(await c.req.json(), "An alert rule is required");
  const savedQueryId = readString(body, "savedQueryId", "Pick the query to watch", 64);
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

  const created = await createAlertRule(organization, {
    savedQueryId,
    name,
    column,
    operator,
    threshold,
  });
  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "alert_rule.created",
    targetKind: "alert_rule",
    targetId: created.id,
    targetLabel: created.name,
  });

  const response: IAlertRuleResponse = { alertRule: created };
  return c.json(response, 201);
}

export async function updateAlertRuleHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/alert-rules/:id">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "schedule", "update"))) {
    throw new ForbiddenException("Only owners and editors can change alert rules");
  }

  const body = readBody(await c.req.json(), "An alert change is required");
  const name = readString(body, "name", "Give the alert a name", MAX_NAME);
  const column = readString(body, "column", "Pick the column to watch", MAX_COLUMN);
  const operatorValue = readString(body, "operator", "Pick an operator", 8);
  if (!isAlertOperator(operatorValue)) {
    throw new BadRequestException("Pick one of >, >=, <, <= or =");
  }
  const threshold = body.threshold;
  if (typeof threshold !== "number" || !Number.isFinite(threshold)) {
    throw new BadRequestException("The threshold must be a number");
  }

  const edited = await updateAlertRule(organization, c.req.param("id"), {
    name,
    column,
    operator: operatorValue,
    threshold,
  });
  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "alert_rule.updated",
    targetKind: "alert_rule",
    targetId: edited.id,
    targetLabel: edited.name,
  });

  const response: IAlertRuleResponse = { alertRule: edited };
  return c.json(response);
}

export async function deleteAlertRuleHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/alert-rules/:id">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "schedule", "delete"))) {
    throw new ForbiddenException("Only owners and editors can remove alert rules");
  }

  const found = await deleteAlertRule(organization, c.req.param("id"));
  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "alert_rule.deleted",
    targetKind: "alert_rule",
    targetId: found.id,
    targetLabel: found.name,
  });
  return c.json({ id: found.id });
}

export async function listAlertDeliveriesHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  return c.json(await listAlertDeliveries(organization));
}

/**
 * A check, on demand, of the alerts watching one saved query — the same
 * operation a due job does about them, so a breach reaching every channel is
 * something the app can be asked for rather than only something a tick can
 * produce. Answers with the deliveries this run wrote.
 */
export async function runAlertChecksHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/saved-queries/:id/alert-checks">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "schedule", "create"))) {
    throw new ForbiddenException("Only owners and editors can check a query's alerts");
  }

  return c.json(await runAlertChecks(organization, c.req.param("id")));
}
