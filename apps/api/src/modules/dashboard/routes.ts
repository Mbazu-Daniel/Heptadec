import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@heptadec/db";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { readBody, readOptionalString, readString, readStringList } from "../../common/http/body";
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
import { recordAudit } from "../audit";
import { deleteDashboardRows } from "../../common/ownership";
import { materializeResult } from "../query-result/cache";
import { widgetData } from "./widget-data";
import {
  dashboardDetail,
  ownSources,
  readDashboardSources,
  replaceDashboardSources,
  toDashboard,
  toWidget,
} from "./detail";
import type { ChartType, ICreateDashboardRequest } from "./contracts";

const { dashboard, widget, savedQuery, dashboardDataSource } = schema;

const MAX_NAME = 120;

const MAX_TITLE = 120;

const MAX_COLUMN = 128;

const MAX_SOURCE_ID = 64;

const CHART_TYPES = ["bar", "line", "pie"] as const;

function readChartType(
  body: Record<string, unknown>,
  message: string,
): ChartType {
  const value = readString(body, "chartType", message, MAX_COLUMN);
  if (!(CHART_TYPES as readonly string[]).includes(value)) {
    throw new BadRequestException(message);
  }
  return value as ChartType;
}

export function dashboardRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/dashboards", requireSession, async (c) => {
    const organization = activeOrganization(c);

    const rows = await organization.db
      .select()
      .from(dashboard)
      .where(organization.where(dashboard.organizationId))
      .orderBy(desc(dashboard.createdAt));

    return c.json({ dashboards: rows.map(toDashboard) });
  });

  routes.post("/api/dashboards", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dashboard", "create"))) {
      throw new ForbiddenException("Only owners and editors can create dashboards");
    }

    const body = readBody(await c.req.json(), "A dashboard is required");
    const request: ICreateDashboardRequest = {
      name: readString(body, "name", "Give the dashboard a name", MAX_NAME),
      dataSourceIds: readStringList(
        body,
        "dataSourceIds",
        "Connect at least one data source",
        MAX_SOURCE_ID,
      ),
    };

    const sources = await ownSources(request.dataSourceIds, organization);
    const now = new Date();
    const created = await organization.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(dashboard)
        .values({
          organizationId: organization.organizationId,
          name: request.name,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (row === undefined) {
        return undefined;
      }
      await tx.insert(dashboardDataSource).values(
        sources.map((source) => ({
          organizationId: organization.organizationId,
          dashboardId: row.id,
          dataSourceId: source.id,
          createdAt: now,
        })),
      );
      return row;
    });

    if (created === undefined) {
      throw new NotFoundException("That dashboard could not be created");
    }
    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "dashboard.created",
      targetKind: "dashboard",
      targetId: created.id,
      targetLabel: created.name,
    });
    return c.json({ dashboard: await dashboardDetail(created, organization) }, 201);
  });
  routes.get("/api/dashboards/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    const found = await oneRow(organization.db, dashboard, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That dashboard does not exist");
    }

    return c.json({ dashboard: await dashboardDetail(found, organization) });
  });

  routes.patch("/api/dashboards/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dashboard", "update"))) {
      throw new ForbiddenException("Only owners and editors can rename dashboards");
    }

    const found = await oneRow(organization.db, dashboard, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That dashboard does not exist");
    }

    const body = readBody(await c.req.json(), "An update is required");
    const name = readOptionalString(body, "name", "Give the dashboard a name", MAX_NAME);
    const dataSourceIds = body.dataSourceIds === undefined
      ? undefined
      : readStringList(body, "dataSourceIds", "Connect at least one data source", MAX_SOURCE_ID);

    if (name === undefined && dataSourceIds === undefined) {
      throw new BadRequestException("Change the name or the connected sources");
    }

    if (dataSourceIds !== undefined) {
      await ownSources(dataSourceIds, organization);
      await replaceDashboardSources(found.id, organization, dataSourceIds);
    }

    const updated =
      name === undefined || name === found.name
        ? found
        : (
            await organization.db
              .update(dashboard)
              .set({ name, updatedAt: new Date() })
              .where(eq(dashboard.id, found.id))
              .returning()
          )[0];

    if (updated === undefined) {
      throw new NotFoundException("That dashboard does not exist");
    }

    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "dashboard.updated",
      targetKind: "dashboard",
      targetId: updated.id,
      targetLabel: updated.name,
    });
    return c.json({ dashboard: await dashboardDetail(updated, organization) });
  });

  routes.delete("/api/dashboards/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dashboard", "delete"))) {
      throw new ForbiddenException("Only owners and editors can delete dashboards");
    }

    const found = await oneRow(organization.db, dashboard, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That dashboard does not exist");
    }
    await deleteDashboardRows(organization, found.id);
    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "dashboard.deleted",
      targetKind: "dashboard",
      targetId: found.id,
      targetLabel: found.name,
    });
    return c.json({ id: found.id });
  });

  routes.post("/api/dashboards/:id/widgets", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dashboard", "create"))) {
      throw new ForbiddenException("Only owners and editors can add charts");
    }

    const found = await oneRow(organization.db, dashboard, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That dashboard does not exist");
    }

    const body = readBody(await c.req.json(), "A chart is required");
    const savedQueryId = readString(body, "savedQueryId", "Pick the query to chart", 64);
    const source = await oneRow(organization.db, savedQuery, savedQueryId, organization);
    if (source === undefined) {
      throw new NotFoundException("That saved query does not exist");
    }
    const connected = await readDashboardSources(found.id, organization);
    if (!connected.some((entry) => entry.dataSourceId === source.dataSourceId)) {
      throw new BadRequestException(
        "Connect that query's data source to this dashboard first",
      );
    }
    const chartType = readChartType(body, "Choose a bar, line, or pie chart");
    const title = readString(body, "title", "Give the chart a title", MAX_TITLE);
    const labelColumn = readString(body, "labelColumn", "Pick the column to label by", MAX_COLUMN);
    const valueColumn = readString(body, "valueColumn", "Pick the column to plot", MAX_COLUMN);

    const now = new Date();
    const inserted = await organization.db
      .insert(widget)
      .values({
        organizationId: organization.organizationId,
        dashboardId: found.id,
        savedQueryId,
        chartType,
        title,
        labelColumn,
        valueColumn,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const created = inserted[0];
    if (created === undefined) {
      throw new NotFoundException("That chart could not be created");
    }
    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "widget.created",
      targetKind: "widget",
      targetId: created.id,
      targetLabel: created.title,
    });
    return c.json({ widget: toWidget(created) }, 201);
  });
  routes.get("/api/widgets/:id/data", requireSession, async (c) => {
    const organization = activeOrganization(c);

    const found = await oneRow(organization.db, widget, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That chart does not exist");
    }

    const data = await widgetData(found, organization);
    return c.json(data);
  });
  routes.post("/api/widgets/:id/refresh", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dashboard", "update"))) {
      throw new ForbiddenException("Only owners and editors can refresh charts");
    }

    const found = await oneRow(organization.db, widget, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That chart does not exist");
    }

    await materializeResult(found.savedQueryId, organization);
    const data = await widgetData(found, organization);
    return c.json(data);
  });

  routes.patch("/api/widgets/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dashboard", "update"))) {
      throw new ForbiddenException("Only owners and editors can edit charts");
    }

    const found = await oneRow(organization.db, widget, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That chart does not exist");
    }

    const body = readBody(await c.req.json(), "An update is required");
    const updated = await organization.db
      .update(widget)
      .set({
        chartType: readChartType(body, "Choose a bar, line, or pie chart"),
        title: readString(body, "title", "Give the chart a title", MAX_TITLE),
        labelColumn: readString(body, "labelColumn", "Pick the column to label by", MAX_COLUMN),
        valueColumn: readString(body, "valueColumn", "Pick the column to plot", MAX_COLUMN),
        updatedAt: new Date(),
      })
      .where(eq(widget.id, found.id))
      .returning();

    const row = updated[0];
    if (row === undefined) {
      throw new NotFoundException("That chart does not exist");
    }
    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "widget.updated",
      targetKind: "widget",
      targetId: row.id,
      targetLabel: row.title,
    });
    return c.json({ widget: toWidget(row) });
  });

  routes.delete("/api/widgets/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dashboard", "delete"))) {
      throw new ForbiddenException("Only owners and editors can remove charts");
    }

    const found = await oneRow(organization.db, widget, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That chart does not exist");
    }

    await organization.db.delete(widget).where(eq(widget.id, found.id));
    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "widget.deleted",
      targetKind: "widget",
      targetId: found.id,
      targetLabel: found.title,
    });
    return c.json({ id: found.id });
  });

  return routes;
}
