import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import {
  readBody,
  readOptionalString,
  readString,
  readStringList,
} from "../../common/http/body";
import { BadRequestException, ForbiddenException } from "../../common/exceptions/index";
import { can } from "../rbac/authorize";
import { recordAudit } from "../audit/index";
import { isChartType } from "./contracts";
import type { ChartType } from "./contracts";
import {
  createDashboard,
  createWidget,
  deleteDashboard,
  deleteWidget,
  getDashboard,
  getWidgetData,
  listDashboards,
  refreshWidget,
  updateDashboard,
  updateWidget,
} from "./dashboard.service";

const MAX_NAME = 120;

const MAX_TITLE = 120;

const MAX_COLUMN = 128;

const MAX_SOURCE_ID = 64;

function readChartType(
  body: Record<string, unknown>,
  message: string,
): ChartType {
  const value = readString(body, "chartType", message, MAX_COLUMN);
  if (!isChartType(value)) {
    throw new BadRequestException(message);
  }
  return value;
}

export async function listDashboardsHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);

  return c.json(await listDashboards(organization));
}

export async function createDashboardHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dashboard", "create"))) {
    throw new ForbiddenException("Only owners and editors can create dashboards");
  }

  const body = readBody(await c.req.json(), "A dashboard is required");

  const created = await createDashboard(organization, {
    name: readString(body, "name", "Give the dashboard a name", MAX_NAME),
    dataSourceIds: readStringList(
      body,
      "dataSourceIds",
      "Connect at least one data source",
      MAX_SOURCE_ID,
    ),
  });

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "dashboard.created",
    targetKind: "dashboard",
    targetId: created.id,
    targetLabel: created.name,
  });
  return c.json({ dashboard: created }, 201);
}

export async function getDashboardHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/dashboards/:id">,
) {
  const organization = activeOrganization(c);

  return c.json({ dashboard: await getDashboard(organization, c.req.param("id")) });
}

export async function updateDashboardHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/dashboards/:id">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dashboard", "update"))) {
    throw new ForbiddenException("Only owners and editors can rename dashboards");
  }

  const body = readBody(await c.req.json(), "An update is required");
  const name = readOptionalString(body, "name", "Give the dashboard a name", MAX_NAME);
  const dataSourceIds = body.dataSourceIds === undefined
    ? undefined
    : readStringList(body, "dataSourceIds", "Connect at least one data source", MAX_SOURCE_ID);

  const updated = await updateDashboard(organization, c.req.param("id"), {
    name,
    dataSourceIds,
  });

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "dashboard.updated",
    targetKind: "dashboard",
    targetId: updated.id,
    targetLabel: updated.name,
  });
  return c.json({ dashboard: updated });
}

export async function deleteDashboardHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/dashboards/:id">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dashboard", "delete"))) {
    throw new ForbiddenException("Only owners and editors can delete dashboards");
  }

  const removed = await deleteDashboard(organization, c.req.param("id"));

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "dashboard.deleted",
    targetKind: "dashboard",
    targetId: removed.id,
    targetLabel: removed.name,
  });
  return c.json({ id: removed.id });
}

export async function createWidgetHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/dashboards/:id/widgets">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dashboard", "create"))) {
    throw new ForbiddenException("Only owners and editors can add charts");
  }

  const body = readBody(await c.req.json(), "A chart is required");

  const created = await createWidget(organization, c.req.param("id"), {
    savedQueryId: readString(body, "savedQueryId", "Pick the query to chart", 64),
    chartType: readChartType(body, "Choose a bar, line, or pie chart"),
    title: readString(body, "title", "Give the chart a title", MAX_TITLE),
    labelColumn: readString(body, "labelColumn", "Pick the column to label by", MAX_COLUMN),
    valueColumn: readString(body, "valueColumn", "Pick the column to plot", MAX_COLUMN),
  });

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "widget.created",
    targetKind: "widget",
    targetId: created.id,
    targetLabel: created.title,
  });
  return c.json({ widget: created }, 201);
}

export async function getWidgetDataHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/widgets/:id/data">,
) {
  const organization = activeOrganization(c);

  return c.json(await getWidgetData(organization, c.req.param("id")));
}

export async function refreshWidgetHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/widgets/:id/refresh">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dashboard", "update"))) {
    throw new ForbiddenException("Only owners and editors can refresh charts");
  }

  return c.json(await refreshWidget(organization, c.req.param("id")));
}

export async function updateWidgetHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/widgets/:id">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dashboard", "update"))) {
    throw new ForbiddenException("Only owners and editors can edit charts");
  }

  const body = readBody(await c.req.json(), "An update is required");

  const row = await updateWidget(organization, c.req.param("id"), {
    chartType: readChartType(body, "Choose a bar, line, or pie chart"),
    title: readString(body, "title", "Give the chart a title", MAX_TITLE),
    labelColumn: readString(body, "labelColumn", "Pick the column to label by", MAX_COLUMN),
    valueColumn: readString(body, "valueColumn", "Pick the column to plot", MAX_COLUMN),
  });

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "widget.updated",
    targetKind: "widget",
    targetId: row.id,
    targetLabel: row.title,
  });
  return c.json({ widget: row });
}

export async function deleteWidgetHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/widgets/:id">,
) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dashboard", "delete"))) {
    throw new ForbiddenException("Only owners and editors can remove charts");
  }

  const removed = await deleteWidget(organization, c.req.param("id"));

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "widget.deleted",
    targetKind: "widget",
    targetId: removed.id,
    targetLabel: removed.title,
  });
  return c.json({ id: removed.id });
}
