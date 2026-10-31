import { and, eq, inArray } from "drizzle-orm";
import {
  dataSource,
  savedQuery,
  widget,
  type AiProviderRow,
} from "@heptadec/db";
import type { IOrganizationScope } from "../../common/session/current-organization";
import { oneRow } from "../../common/session/current-organization";
import {
  BadRequestException,
  NotFoundException,
} from "../../common/exceptions";
import { logDriverFailure } from "../../common/driver-error";
import { canUseTooling } from "../data-source/engines";
import { readStructure, runReadOnly } from "../data-source/tooling";
import type { Introspected } from "../schema/introspect";
import type { IQueryResponse } from "../query/contracts";
import { gridNumber } from "../query/contracts";
import { cacheResult, cachedResult } from "../query-result/cache";
import { createSavedQuery, editSavedQuery } from "../saved-query/edit";
import {
  completeAnswer,
  failureMessage,
  readJsonObject,
  readSources,
  type IAnswerSource,
} from "../ai/answer";
import type { ITurn } from "../ai/turn";
import { schemaContext } from "../ai/context";
import {
  dashboardAskInstructions,
  dashboardPlanInstructions,
} from "../ai/instructions";
import { isChartType } from "./contracts";
import type {
  ChartType,
  IAddChartAction,
  IAppliedAction,
  IDashboardProposal,
  IProposalAction,
  IUpdateChartAction,
  IWidget,
} from "./contracts";
import {
  ownSources,
  readDashboardSources,
} from "./detail";

const MAX_TITLE = 120;

const MAX_COLUMN = 128;

const MAX_SQL = 20_000;

const MAX_SUMMARY = 400;

const MAX_ID = 64;

const MAX_CHARTS = 16;

const MAX_ACTIONS = 16;

type IToolingSource = typeof dataSource.$inferSelect;

interface IChartDraft {
  sourceId: string;
  title: string;
  sql: string;
  chartType: ChartType;
  labelColumn: string;
  valueColumn: string;
  grid: IQueryResponse;
}

export interface IChartPlan {
  problem: string | null;
  skipped: string[];
}

/**
 * Asks the provider for a plan and places every chart it returns, so the route
 * only has to report what happened. A chart that cannot be built is skipped
 * with the reason; one bad chart never abandons the rest.
 */
export async function planCharts(
  turn: ITurn,
  provider: AiProviderRow,
  dashboardId: string,
  sources: IToolingSource[],
  brief: string | undefined,
  organization: IOrganizationScope,
): Promise<IChartPlan> {
  const analysed = sources.filter(canUseTooling);
  if (analysed.length === 0) {
    return {
      problem:
        "None of those sources can be described in full yet, so there is nothing to build from them.",
      skipped: [],
    };
  }

  const skipped: string[] = [];
  try {
    const blocks = await readSources(turn, analysed.map(answerSource));
    const answer = await completeAnswer(turn, {
      provider,
      instructions: dashboardPlanInstructions,
      prompt: planPrompt(blocks, brief),
    });
    const plan = readJsonObject(answer);
    const charts =
      plan === null ? [] : asArray(plan.charts).slice(0, MAX_CHARTS);
    if (charts.length === 0) {
      return {
        problem:
          "That provider did not return a plan. The dashboard is saved with its sources connected, so you can add charts by hand or ask again.",
        skipped,
      };
    }

    for (const raw of charts) {
      try {
        const draft = await buildChart(raw, analysed);
        await persistChart(dashboardId, draft, organization);
        await turn.status(`Added ${draft.title}`);
      } catch (caught) {
        skipped.push(skippedFor(caught, raw));
      }
    }
    return { problem: null, skipped };
  } catch (caught) {
    return {
      problem: failureMessage(
        caught,
        "produce that plan",
        "That source could not be read, or the provider could not be reached. The dashboard is saved with its sources connected.",
      ),
      skipped,
    };
  }
}

/** The proposal the provider read from a question, or null if it gave none. */
export async function proposeChanges(
  turn: ITurn,
  provider: AiProviderRow,
  dashboardName: string,
  analysed: IToolingSource[],
  widgets: IWidget[],
  organization: IOrganizationScope,
  question: string,
): Promise<IDashboardProposal | null> {
  try {
    const blocks = await readSources(turn, analysed.map(answerSource));
    const answer = await completeAnswer(turn, {
      provider,
      instructions: dashboardAskInstructions,
      prompt: await askPrompt(
        dashboardName,
        blocks,
        widgets,
        organization,
        question,
      ),
    });
    return readProposal(answer, question);
  } catch (caught) {
    logDriverFailure(caught, "answer that request");
    return null;
  }
}

/**
 * Applies approved actions in order. Each action succeeds or fails on its own:
 * a refusal is reported against its index rather than aborting the batch.
 */
export async function applyChanges(
  dashboardId: string,
  requested: unknown[],
  analysed: IToolingSource[],
  widgets: IWidget[],
  organization: IOrganizationScope,
): Promise<IAppliedAction[]> {
  const actions: IProposalAction[] = [];
  for (const raw of requested.slice(0, MAX_ACTIONS)) {
    const action = readAction(raw);
    if (action === null) {
      throw new BadRequestException("One of those changes was not readable");
    }
    actions.push(action);
  }
  if (actions.length === 0) {
    throw new BadRequestException("Approve at least one change");
  }

  const applied: IAppliedAction[] = [];
  for (const [index, action] of actions.entries()) {
    try {
      const widgetId = await applyAction(
        dashboardId,
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
  return applied;
}

/** The sources on this dashboard that AI can describe in full. */
export async function analysisSources(
  dashboardId: string,
  organization: IOrganizationScope,
): Promise<IToolingSource[]> {
  const connected = await readDashboardSources(dashboardId, organization);
  if (connected.length === 0) {
    return [];
  }
  const rows = await ownSources(
    connected.map((entry) => entry.dataSourceId),
    organization,
  );
  return rows.filter(canUseTooling);
}

function readChartType(raw: unknown): ChartType | null {
  return typeof raw === "string" && isChartType(raw) ? raw : null;
}

function readId(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 && raw.length <= MAX_ID
    ? raw
    : null;
}

function asArray(raw: unknown): unknown[] {
  return Array.isArray(raw) ? raw : [];
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
  allowed: IToolingSource[],
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

  const grid = await runReadOnly(source, sql, "draft-preview");
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

  const query = await createSavedQuery(organization, {
    dataSourceId: draft.sourceId,
    name: draft.title,
    sql: draft.sql,
  });
  await cacheResult(organization.db, organization.organizationId, query.id, draft.grid);

  const placed = await organization.db
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
  analysed: IToolingSource[],
  widgets: IWidget[],
  organization: IOrganizationScope,
): Promise<string> {
  const now = new Date();

  if (action.kind === "remove") {
    const owned = ownedWidget(action.widgetId, widgets);
    await organization.db.delete(widget).where(eq(widget.id, owned.id));
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
  analysed: IToolingSource[],
  widgets: IWidget[],
  organization: IOrganizationScope,
  now: Date,
): Promise<string> {
  const owned = ownedWidget(action.widgetId, widgets);
  const query = await oneRow(organization.db, savedQuery, owned.savedQueryId, organization);
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
    await organization.db
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

  await editSavedQuery(organization, query.id, { sql: draft.sql });
  await cacheResult(organization.db, organization.organizationId, query.id, draft.grid);
  await organization.db
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

function schemaBlock(
  source: IToolingSource,
  described: Introspected,
): string {
  return `-- Source: ${source.name} (id: ${source.id})\n${schemaContext({ sourceId: source.id, ...described })}`;
}

function answerSource(source: IToolingSource): IAnswerSource {
  return {
    name: source.name,
    read: async () => schemaBlock(source, await readStructure(source)),
  };
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
      : await organization.db
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
