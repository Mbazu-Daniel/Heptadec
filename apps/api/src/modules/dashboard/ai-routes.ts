import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@heptadec/db";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  activeOrganization,
  oneRow,
  type IOrganizationScope,
} from "../../common/session/current-organization";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions";
import {
  readBody,
  readOptionalString,
  readString,
  readStringList,
} from "../../common/http/body";
import { can } from "../rbac/authorize";
import { savedConnection } from "../data-source/connection";
import { introspectPostgres } from "../schema/postgres";
import { runPostgresQuery } from "../query/postgres";
import type { IQueryResponse } from "../query/contracts";
import { gridNumber } from "../query/contracts";
import { cacheResult, cachedResult } from "../query-result/cache";
import { complete } from "../ai/generate";
import { chosenProvider } from "../ai/provider";
import { schemaContext } from "../ai/context";
import {
  dashboardAskInstructions,
  dashboardPlanInstructions,
} from "../ai/instructions";
import {
  dashboardDetail,
  ownSources,
  readDashboardSources,
  readWidgets,
} from "./detail";
import type {
  ChartType,
  IAddChartAction,
  IApplyProposalResponse,
  IAppliedAction,
  IAskDashboardResponse,
  IDashboardProposal,
  IGenerateDashboardRequest,
  IGenerateDashboardResponse,
  IProposalAction,
  IUpdateChartAction,
  IWidget,
} from "./contracts";

const { dashboard, dashboardDataSource, dataSource, queryVersion, savedQuery, widget } =
  schema;

const MAX_NAME = 120;

const MAX_TITLE = 120;

const MAX_COLUMN = 128;

const MAX_SQL = 20_000;

const MAX_QUESTION = 2_000;

const MAX_BRIEF = 1_000;

const MAX_SUMMARY = 400;

const MAX_ID = 64;

const MAX_CHARTS = 16;

const MAX_ACTIONS = 16;

const CHART_TYPES = ["bar", "line", "pie"] as const;

type IPostgresSource = typeof dataSource.$inferSelect;

interface IChartDraft {
  sourceId: string;
  title: string;
  sql: string;
  chartType: ChartType;
  labelColumn: string;
  valueColumn: string;
  grid: IQueryResponse;
}

function dashboardAiRoutes() {
  const routes = new Hono<IAuthVars>();

  routes.post("/api/dashboards/generate", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(c.req.raw.headers, "dashboard", "create"))) {
      throw new ForbiddenException(
        "Only owners and editors can create dashboards",
      );
    }

    const payload = readBody(await c.req.json(), "A dashboard is required");
    const request: IGenerateDashboardRequest = {
      name: readString(payload, "name", "Give the dashboard a name", MAX_NAME),
      dataSourceIds: readStringList(
        payload,
        "dataSourceIds",
        "Connect at least one data source",
        MAX_ID,
      ),
      brief: readOptionalString(
        payload,
        "brief",
        "Say what the dashboard should show",
        MAX_BRIEF,
      ),
    };

    const sources = await ownSources(request.dataSourceIds, organization);
    const provider = await chosenProvider(
      organization.organizationId,
      payload.providerId,
    );
    if (provider === null) {
      throw new BadRequestException(
        "No AI provider is set up for this organization yet",
      );
    }

    const now = new Date();
    const created = await db.transaction(async (tx) => {
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

    return streamSSE(c, async (stream) => {
      stream.onAbort(() => {
        void stream.abort();
      });

      let problem: string | null = null;
      const skipped: string[] = [];

      try {
        const analysed = sources.filter((row) => row.kind === "postgres");
        if (analysed.length === 0) {
          problem =
            "None of those sources can be analysed yet — only Postgres can.";
        } else {
          const blocks: string[] = [];
          for (const source of analysed) {
            await stream.writeSSE({
              event: "status",
              data: JSON.stringify({ message: `Reading ${source.name}…` }),
            });
            const described = await introspectPostgres(savedConnection(source));
            blocks.push(schemaBlock(source, described));
          }

          await stream.writeSSE({
            event: "status",
            data: JSON.stringify({
              message: `Asking ${provider.name} (${provider.model})…`,
            }),
          });

          const answer = await complete(
            provider,
            dashboardPlanInstructions,
            planPrompt(blocks, request.brief),
          );
          const plan = readJsonObject(answer);
          const charts = plan === null ? [] : asArray(plan.charts).slice(0, MAX_CHARTS);
          if (charts.length === 0) {
            problem =
              "That provider did not return a plan. The dashboard is saved with its sources connected, so you can add charts by hand or ask again.";
          }

          for (const raw of charts) {
            try {
              const draft = await buildChart(raw, analysed);
              await persistChart(created.id, draft, organization);
              await stream.writeSSE({
                event: "status",
                data: JSON.stringify({ message: `Added ${draft.title}` }),
              });
            } catch (caught) {
              skipped.push(skippedFor(caught, raw));
            }
          }
        }
      } catch (caught) {
        console.error(`[dashboard] that plan could not be produced:`, caught);
        problem =
          "That source could not be read, or the provider could not be reached. The dashboard is saved with its sources connected.";
      }

      if (skipped.length > 0) {
        await stream.writeSSE({
          event: "skipped",
          data: JSON.stringify({ titles: skipped }),
        });
      }
      if (problem !== null) {
        await stream.writeSSE({
          event: "problem",
          data: JSON.stringify({ message: problem }),
        });
      }

      const response: IGenerateDashboardResponse = {
        dashboard: await dashboardDetail(created, organization),
        durationMs: Date.now() - now.getTime(),
      };
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify(response),
      });
    });
  });

  routes.post("/api/dashboards/:id/ask", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(c.req.raw.headers, "dashboard", "update"))) {
      throw new ForbiddenException(
        "Only owners and editors can change dashboards",
      );
    }

    const found = await oneRow(dashboard, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That dashboard does not exist");
    }

    const payload = readBody(await c.req.json(), "A question is required");
    const question = readString(
      payload,
      "question",
      "Say what you want changed",
      MAX_QUESTION,
    );
    const provider = await chosenProvider(
      organization.organizationId,
      payload.providerId,
    );
    if (provider === null) {
      throw new BadRequestException(
        "No AI provider is set up for this organization yet",
      );
    }

    const analysed = await dashboardSources(found.id, organization);
    if (analysed.length === 0) {
      throw new BadRequestException(
        "Only Postgres sources can be analysed, and this dashboard has none connected",
      );
    }

    const startedAt = Date.now();
    const widgets = await readWidgets(found.id, organization);

    return streamSSE(c, async (stream) => {
      stream.onAbort(() => {
        void stream.abort();
      });

      let proposal: IDashboardProposal | null = null;

      try {
        const blocks: string[] = [];
        for (const source of analysed) {
          await stream.writeSSE({
            event: "status",
            data: JSON.stringify({ message: `Reading ${source.name}…` }),
          });
          const described = await introspectPostgres(savedConnection(source));
          blocks.push(schemaBlock(source, described));
        }

        await stream.writeSSE({
          event: "status",
          data: JSON.stringify({
            message: `Asking ${provider.name} (${provider.model})…`,
          }),
        });

        const answer = await complete(
          provider,
          dashboardAskInstructions,
          await askPrompt(found.name, blocks, widgets, organization, question),
        );
        proposal = readProposal(answer, question);
      } catch (caught) {
        console.error(`[dashboard] that request could not be answered:`, caught);
      }

      if (proposal === null) {
        await stream.writeSSE({
          event: "problem",
          data: JSON.stringify({
            message:
              "That provider did not return a proposal. Check the key, the model id, and the base URL.",
          }),
        });
        return;
      }

      const response: IAskDashboardResponse = {
        proposal,
        providerName: provider.name,
        model: provider.model,
        durationMs: Date.now() - startedAt,
      };
      await stream.writeSSE({
        event: "done",
        data: JSON.stringify(response),
      });
    });
  });

  routes.post("/api/dashboards/:id/apply", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(c.req.raw.headers, "dashboard", "update"))) {
      throw new ForbiddenException(
        "Only owners and editors can change dashboards",
      );
    }

    const found = await oneRow(dashboard, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That dashboard does not exist");
    }

    const payload = readBody(await c.req.json(), "Approve at least one change");
    if (!Array.isArray(payload.actions)) {
      throw new BadRequestException("Approve at least one change");
    }

    const actions: IProposalAction[] = [];
    for (const raw of payload.actions.slice(0, MAX_ACTIONS)) {
      const action = readAction(raw);
      if (action === null) {
        throw new BadRequestException("One of those changes was not readable");
      }
      actions.push(action);
    }
    if (actions.length === 0) {
      throw new BadRequestException("Approve at least one change");
    }

    const analysed = await dashboardSources(found.id, organization);
    const widgets = await readWidgets(found.id, organization);

    const applied: IAppliedAction[] = [];
    for (const [index, action] of actions.entries()) {
      try {
        const widgetId = await applyAction(
          found.id,
          action,
          analysed,
          widgets,
          organization,
        );
        applied.push({ index, kind: action.kind, widgetId, problem: null });
      } catch (caught) {
        applied.push({
          index,
          kind: action.kind,
          widgetId: null,
          problem: messageOf(caught),
        });
      }
    }

    const response: IApplyProposalResponse = {
      dashboard: await dashboardDetail(found, organization),
      applied,
    };
    return c.json(response);
  });

  return routes;
}

function isRead(sql: string): boolean {
  const head = sql.replace(/[\s(]+/g, " ").trim().toUpperCase();
  return head.startsWith("SELECT") || head.startsWith("WITH");
}

function readChartType(raw: unknown): ChartType | null {
  return typeof raw === "string" && (CHART_TYPES as readonly string[]).includes(raw)
    ? (raw as ChartType)
    : null;
}

function readId(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 && raw.length <= MAX_ID
    ? raw
    : null;
}

function asArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
}

function readJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```[a-z]*/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickChartColumns(
  grid: IQueryResponse,
  wanted: { labelColumn: string; valueColumn: string },
): { labelColumn: string; valueColumn: string } | null {
  if (grid.rows.length === 0) {
    return null;
  }
  const numeric = grid.columns.filter((column) =>
    grid.rows.every((row) => gridNumber(row[column]) !== null),
  );
  if (numeric.length === 0) {
    return null;
  }

  const value = numeric.includes(wanted.valueColumn)
    ? wanted.valueColumn
    : numeric[0];
  if (value === undefined) {
    return null;
  }

  const labels = grid.columns.filter((column) => column !== value);
  const label = labels.includes(wanted.labelColumn)
    ? wanted.labelColumn
    : labels[0];
  if (label === undefined) {
    return null;
  }

  return { labelColumn: label, valueColumn: value };
}

async function buildChart(
  raw: unknown,
  allowed: IPostgresSource[],
): Promise<IChartDraft> {
  if (typeof raw !== "object" || raw === null) {
    throw new BadRequestException("That chart was not readable");
  }
  const entry = raw as Record<string, unknown>;

  const sourceId = readId(entry.sourceId);
  const source =
    sourceId === null
      ? undefined
      : allowed.find((candidate) => candidate.id === sourceId);
  if (source === undefined) {
    throw new BadRequestException(
      "That chart names a source this dashboard does not draw from",
    );
  }

  const sql = typeof entry.sql === "string" ? entry.sql.trim() : "";
  if (sql.length === 0 || sql.length > MAX_SQL) {
    throw new BadRequestException("That chart's statement is missing or too long");
  }
  if (!isRead(sql)) {
    throw new BadRequestException("That chart's statement is not a read");
  }

  const chartType = readChartType(entry.chartType);
  if (chartType === null) {
    throw new BadRequestException(
      "That chart is not a bar, line, or pie chart",
    );
  }

  const title = typeof entry.title === "string" ? entry.title.trim() : "";
  if (title.length === 0 || title.length > MAX_TITLE) {
    throw new BadRequestException("That chart has no usable title");
  }

  const wanted = {
    labelColumn: typeof entry.labelColumn === "string" ? entry.labelColumn : "",
    valueColumn: typeof entry.valueColumn === "string" ? entry.valueColumn : "",
  };

  const grid = await runPostgresQuery(
    { ...savedConnection(source), readOnly: true },
    sql,
  );
  const columns = pickChartColumns(grid, wanted);
  if (columns === null) {
    throw new BadRequestException(
      "That chart returned nothing that could be plotted",
    );
  }

  return { sourceId: source.id, title, sql, chartType, ...columns, grid };
}

async function persistChart(
  dashboardId: string,
  draft: IChartDraft,
  organization: IOrganizationScope,
): Promise<string> {
  const now = new Date();

  const inserted = await db
    .insert(savedQuery)
    .values({
      organizationId: organization.organizationId,
      dataSourceId: draft.sourceId,
      name: draft.title,
      sql: draft.sql,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const query = inserted[0];
  if (query === undefined) {
    throw new BadRequestException("That chart's query could not be saved");
  }
  await cacheResult(organization.organizationId, query.id, draft.grid);

  const placed = await db
    .insert(widget)
    .values({
      organizationId: organization.organizationId,
      dashboardId,
      savedQueryId: query.id,
      chartType: draft.chartType,
      title: draft.title,
      labelColumn: draft.labelColumn,
      valueColumn: draft.valueColumn,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  const row = placed[0];
  if (row === undefined) {
    throw new BadRequestException("That chart could not be saved");
  }
  return row.id;
}

async function applyAction(
  dashboardId: string,
  action: IProposalAction,
  analysed: IPostgresSource[],
  widgets: IWidget[],
  organization: IOrganizationScope,
): Promise<string> {
  const now = new Date();

  if (action.kind === "remove") {
    const owned = ownedWidget(action.widgetId, widgets);
    await db.delete(widget).where(eq(widget.id, owned.id));
    return owned.id;
  }

  if (action.kind === "update") {
    return updateChart(action, analysed, widgets, organization, now);
  }

  const source = analysed.find(
    (candidate) => candidate.id === action.sourceId,
  );
  if (source === undefined) {
    throw new BadRequestException(
      "Connect that source to this dashboard first",
    );
  }
  const draft = await buildChart(action, analysed);
  return persistChart(dashboardId, draft, organization);
}

async function updateChart(
  action: IUpdateChartAction,
  analysed: IPostgresSource[],
  widgets: IWidget[],
  organization: IOrganizationScope,
  now: Date,
): Promise<string> {
  const owned = ownedWidget(action.widgetId, widgets);
  const query = await oneRow(savedQuery, owned.savedQueryId, organization);
  if (query === undefined) {
    throw new NotFoundException("That chart's query no longer exists");
  }

  if (action.sql === undefined) {
    const cached = await cachedResult(query.id, organization);
    if (cached !== null) {
      if (
        action.labelColumn !== undefined &&
        !cached.grid.columns.includes(action.labelColumn)
      ) {
        throw new BadRequestException(
          `That query has no ${action.labelColumn} column to label by`,
        );
      }
      if (
        action.valueColumn !== undefined &&
        !cached.grid.columns.includes(action.valueColumn)
      ) {
        throw new BadRequestException(
          `That query has no ${action.valueColumn} column to plot`,
        );
      }
    }
    await db
      .update(widget)
      .set({
        ...(action.title === undefined ? {} : { title: action.title }),
        ...(action.chartType === undefined ? {} : { chartType: action.chartType }),
        ...(action.labelColumn === undefined
          ? {}
          : { labelColumn: action.labelColumn }),
        ...(action.valueColumn === undefined
          ? {}
          : { valueColumn: action.valueColumn }),
        updatedAt: now,
      })
      .where(eq(widget.id, owned.id));
    return owned.id;
  }

  const source = analysed.find((candidate) => candidate.id === query.dataSourceId);
  if (source === undefined) {
    throw new BadRequestException(
      "Connect this chart's source to the dashboard first",
    );
  }

  const draft = await buildChart(
    {
      sourceId: source.id,
      title: action.title ?? owned.title,
      sql: action.sql,
      chartType: action.chartType ?? owned.chartType,
      labelColumn: action.labelColumn ?? owned.labelColumn,
      valueColumn: action.valueColumn ?? owned.valueColumn,
    },
    analysed,
  );

  await db.insert(queryVersion).values({
    organizationId: query.organizationId,
    savedQueryId: query.id,
    name: query.name,
    sql: query.sql,
    createdAt: now,
  });
  await db
    .update(savedQuery)
    .set({ sql: draft.sql, updatedAt: now })
    .where(eq(savedQuery.id, query.id));
  await cacheResult(organization.organizationId, query.id, draft.grid);
  await db
    .update(widget)
    .set({
      chartType: draft.chartType,
      labelColumn: draft.labelColumn,
      valueColumn: draft.valueColumn,
      updatedAt: now,
    })
    .where(eq(widget.id, owned.id));

  return owned.id;
}

function ownedWidget(widgetId: string, widgets: IWidget[]): IWidget {
  const owned = widgets.find((entry) => entry.id === widgetId);
  if (owned === undefined) {
    throw new NotFoundException("That chart is not on this dashboard");
  }
  return owned;
}

async function dashboardSources(
  dashboardId: string,
  organization: IOrganizationScope,
): Promise<IPostgresSource[]> {
  const connected = await readDashboardSources(dashboardId, organization);
  if (connected.length === 0) {
    return [];
  }
  const rows = await ownSources(
    connected.map((entry) => entry.dataSourceId),
    organization,
  );
  return rows.filter((row) => row.kind === "postgres");
}

function schemaBlock(
  source: IPostgresSource,
  described: Awaited<ReturnType<typeof introspectPostgres>>,
): string {
  return `-- Source: ${source.name} (id: ${source.id})\n${schemaContext({ sourceId: source.id, ...described })}`;
}

function planPrompt(blocks: string[], brief: string | undefined): string {
  const briefBlock =
    brief === undefined || brief === "" ? "" : `\n## Brief\n${brief}\n`;
  return `Schemas:\n${blocks.join("\n\n")}${briefBlock}`;
}

async function askPrompt(
  name: string,
  blocks: string[],
  widgets: IWidget[],
  organization: IOrganizationScope,
  question: string,
): Promise<string> {
  const ids = widgets.map((entry) => entry.savedQueryId);
  const queries =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(savedQuery)
          .where(
            and(
              inArray(savedQuery.id, ids),
              organization.where(savedQuery.organizationId),
            ),
          );
  const sqlById = new Map(queries.map((entry) => [entry.id, entry.sql]));

  const current =
    widgets.length === 0
      ? "(none — this dashboard has no charts yet)"
      : widgets
          .map(
            (entry) =>
              `- id ${entry.id} | "${entry.title}" | ${entry.chartType} | labels by ${entry.labelColumn}, plots ${entry.valueColumn}\n  ${sqlById.get(entry.savedQueryId) ?? "(query unavailable)"}`,
          )
          .join("\n");

  return `Schemas:\n${blocks.join("\n\n")}

## This dashboard's charts
${current}

## Request
${question}`;
}

function readAction(raw: unknown): IProposalAction | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const entry = raw as Record<string, unknown>;

  if (entry.kind === "remove") {
    const widgetId = readId(entry.widgetId);
    return widgetId === null ? null : { kind: "remove", widgetId };
  }

  if (entry.kind === "update") {
    const widgetId = readId(entry.widgetId);
    if (widgetId === null) {
      return null;
    }
    const action: IUpdateChartAction = { kind: "update", widgetId };
    const title =
      typeof entry.title === "string" ? entry.title.trim() : "";
    if (title !== "") {
      action.title = title.slice(0, MAX_TITLE);
    }
    const chartType = readChartType(entry.chartType);
    if (chartType !== null) {
      action.chartType = chartType;
    }
    const labelColumn =
      typeof entry.labelColumn === "string" ? entry.labelColumn.trim() : "";
    if (labelColumn !== "") {
      action.labelColumn = labelColumn.slice(0, MAX_COLUMN);
    }
    const valueColumn =
      typeof entry.valueColumn === "string" ? entry.valueColumn.trim() : "";
    if (valueColumn !== "") {
      action.valueColumn = valueColumn.slice(0, MAX_COLUMN);
    }
    const sql = typeof entry.sql === "string" ? entry.sql.trim() : "";
    if (sql !== "") {
      action.sql = sql.slice(0, MAX_SQL);
    }
    return action;
  }

  if (entry.kind === "add") {
    const sourceId = readId(entry.sourceId);
    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    const sql = typeof entry.sql === "string" ? entry.sql.trim() : "";
    const chartType = readChartType(entry.chartType);
    if (
      sourceId === null ||
      title === "" ||
      sql === "" ||
      chartType === null
    ) {
      return null;
    }
    const action: IAddChartAction = {
      kind: "add",
      sourceId,
      title: title.slice(0, MAX_TITLE),
      sql: sql.slice(0, MAX_SQL),
      chartType,
      labelColumn:
        typeof entry.labelColumn === "string"
          ? entry.labelColumn.slice(0, MAX_COLUMN)
          : "",
      valueColumn:
        typeof entry.valueColumn === "string"
          ? entry.valueColumn.slice(0, MAX_COLUMN)
          : "",
    };
    return action;
  }

  return null;
}

function readProposal(
  text: string,
  question: string,
): IDashboardProposal | null {
  const plan = readJsonObject(text);
  if (plan === null) {
    return null;
  }
  const summary =
    typeof plan.summary === "string" && plan.summary.trim() !== ""
      ? plan.summary.trim().slice(0, MAX_SUMMARY)
      : `You asked: ${question.slice(0, MAX_SUMMARY)}`;

  const actions: IProposalAction[] = [];
  for (const raw of asArray(plan.actions).slice(0, MAX_ACTIONS)) {
    const action = readAction(raw);
    if (action !== null) {
      actions.push(action);
    }
  }

  if (actions.length === 0) {
    return {
      summary: `${summary} Nothing to change.`,
      actions: [],
    };
  }
  return { summary, actions };
}

function skippedFor(caught: unknown, raw: unknown): string {
  const title =
    typeof raw === "object" && raw !== null && "title" in raw
      ? String((raw as Record<string, unknown>).title)
      : "a chart";
  return `${title} — ${messageOf(caught)}`;
}

function messageOf(caught: unknown): string {
  return caught instanceof Error ? caught.message : "That change failed";
}

export { dashboardAiRoutes };
