import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import {
  dashboard,
  dashboardDataSource,
  savedQuery,
  widget,
  type AiProviderRow,
} from "@heptadec/db";
import type {
  IOrganizationScope,
} from "../../common/session/current-organization";
import { oneRow } from "../../common/session/current-organization";
import {
  BadRequestException,
  NotFoundException,
} from "../../common/exceptions/index";
import { chosenProvider } from "../ai/provider";
import { deleteDashboardRows } from "../../common/ownership";
import { materializeResult } from "../query-result/cache";
import { widgetData } from "./widget-data";
import {
  dashboardDetail,
  ownSources,
  readDashboardSources,
  readWidgets,
  replaceDashboardSources,
  toDashboard,
  toWidget,
} from "./detail";
import {
  analysisSources,
  applyChanges,
  planCharts,
  proposeChanges,
} from "./ai";
import type {
  IApplyProposalResponse,
  IAskDashboardResponse,
  IDashboardListResponse,
  IDashboardWithWidgets,
  IGenerateDashboardResponse,
  IWidget,
  IWidgetData,
} from "./contracts";
import type { IStreamTurn } from "../../common/http/stream";
import type {
  IAskDashboardInput,
  ICreateDashboardInput,
  ICreateWidgetInput,
  IGenerateDashboardInput,
  IUpdateDashboardInput,
  IUpdateWidgetInput,
} from "./types";

type DashboardRow = typeof dashboard.$inferSelect;

type DataSourceRow = Awaited<ReturnType<typeof ownSources>>[number];

export interface ICreatedDashboard {
  dashboard: DashboardRow;
  sources: DataSourceRow[];
}

export async function listDashboards(
  organization: IOrganizationScope,
): Promise<IDashboardListResponse> {
  const rows = await organization.db
    .select()
    .from(dashboard)
    .where(organization.where(dashboard.organizationId))
    .orderBy(desc(dashboard.createdAt));

  return { dashboards: rows.map(toDashboard) };
}

export async function createDashboard(
  organization: IOrganizationScope,
  input: ICreateDashboardInput,
): Promise<IDashboardWithWidgets> {
  const { dashboard: created } = await createDashboardRow(organization, input);
  return dashboardDetail(created, organization);
}

export async function createDashboardRow(
  organization: IOrganizationScope,
  input: ICreateDashboardInput,
): Promise<ICreatedDashboard> {
  const sources = await ownSources(input.dataSourceIds, organization);
  const now = new Date();
  // The links name the dashboard they hang off, so its id is minted here
  // rather than left to the column default: one batch cannot read what an
  // earlier statement in the same batch generated.
  const dashboardId = randomUUID();
  const [rows] = await organization.db.batch([
    organization.db
      .insert(dashboard)
      .values({
        id: dashboardId,
        organizationId: organization.organizationId,
        name: input.name,
        createdAt: now,
        updatedAt: now,
      })
      .returning(),
    organization.db.insert(dashboardDataSource).values(
      sources.map((source) => ({
        organizationId: organization.organizationId,
        dashboardId,
        dataSourceId: source.id,
        createdAt: now,
      })),
    ),
  ]);
  const created = rows[0];

  if (created === undefined) {
    throw new NotFoundException("That dashboard could not be created");
  }
  return { dashboard: created, sources };
}

export async function getDashboardRow(
  organization: IOrganizationScope,
  id: string,
): Promise<DashboardRow> {
  const found = await oneRow(organization.db, dashboard, id, organization);
  if (found === undefined) {
    throw new NotFoundException("That dashboard does not exist");
  }
  return found;
}

export async function getDashboard(
  organization: IOrganizationScope,
  id: string,
): Promise<IDashboardWithWidgets> {
  const found = await getDashboardRow(organization, id);
  return dashboardDetail(found, organization);
}

export async function updateDashboard(
  organization: IOrganizationScope,
  id: string,
  input: IUpdateDashboardInput,
): Promise<IDashboardWithWidgets> {
  const found = await getDashboardRow(organization, id);

  if (input.name === undefined && input.dataSourceIds === undefined) {
    throw new BadRequestException("Change the name or the connected sources");
  }

  if (input.dataSourceIds !== undefined) {
    await ownSources(input.dataSourceIds, organization);
    await replaceDashboardSources(found.id, organization, input.dataSourceIds);
  }

  const updated =
    input.name === undefined || input.name === found.name
      ? found
      : (
          await organization.db
            .update(dashboard)
            .set({ name: input.name, updatedAt: new Date() })
            .where(eq(dashboard.id, found.id))
            .returning()
        )[0];

  if (updated === undefined) {
    throw new NotFoundException("That dashboard does not exist");
  }

  return dashboardDetail(updated, organization);
}

export async function deleteDashboard(
  organization: IOrganizationScope,
  id: string,
): Promise<DashboardRow> {
  const found = await getDashboardRow(organization, id);
  await deleteDashboardRows(organization, found.id);
  return found;
}

export async function createWidget(
  organization: IOrganizationScope,
  dashboardId: string,
  input: ICreateWidgetInput,
): Promise<IWidget> {
  const found = await getDashboardRow(organization, dashboardId);

  const source = await oneRow(
    organization.db,
    savedQuery,
    input.savedQueryId,
    organization,
  );
  if (source === undefined) {
    throw new NotFoundException("That saved query does not exist");
  }
  const connected = await readDashboardSources(found.id, organization);
  if (!connected.some((entry) => entry.dataSourceId === source.dataSourceId)) {
    throw new BadRequestException(
      "Connect that query's data source to this dashboard first",
    );
  }

  const now = new Date();
  const inserted = await organization.db
    .insert(widget)
    .values({
      organizationId: organization.organizationId,
      dashboardId: found.id,
      savedQueryId: input.savedQueryId,
      chartType: input.chartType,
      title: input.title,
      labelColumn: input.labelColumn,
      valueColumn: input.valueColumn,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const created = inserted[0];
  if (created === undefined) {
    throw new NotFoundException("That chart could not be created");
  }
  return toWidget(created);
}

export async function getWidgetRow(
  organization: IOrganizationScope,
  id: string,
): Promise<typeof widget.$inferSelect> {
  const found = await oneRow(organization.db, widget, id, organization);
  if (found === undefined) {
    throw new NotFoundException("That chart does not exist");
  }
  return found;
}

export async function getWidgetData(
  organization: IOrganizationScope,
  widgetId: string,
): Promise<IWidgetData> {
  const found = await getWidgetRow(organization, widgetId);
  return widgetData(found, organization);
}

export async function refreshWidget(
  organization: IOrganizationScope,
  widgetId: string,
): Promise<IWidgetData> {
  const found = await getWidgetRow(organization, widgetId);

  await materializeResult(found.savedQueryId, organization);
  return widgetData(found, organization);
}

export async function updateWidget(
  organization: IOrganizationScope,
  widgetId: string,
  input: IUpdateWidgetInput,
): Promise<IWidget> {
  const found = await getWidgetRow(organization, widgetId);

  const updated = await organization.db
    .update(widget)
    .set({
      chartType: input.chartType,
      title: input.title,
      labelColumn: input.labelColumn,
      valueColumn: input.valueColumn,
      updatedAt: new Date(),
    })
    .where(eq(widget.id, found.id))
    .returning();

  const row = updated[0];
  if (row === undefined) {
    throw new NotFoundException("That chart does not exist");
  }
  return toWidget(row);
}

export async function deleteWidget(
  organization: IOrganizationScope,
  widgetId: string,
): Promise<typeof widget.$inferSelect> {
  const found = await getWidgetRow(organization, widgetId);

  await organization.db.delete(widget).where(eq(widget.id, found.id));
  return found;
}

export interface IGeneratedDashboard {
  dashboard: DashboardRow;
  sources: DataSourceRow[];
  provider: AiProviderRow;
  now: Date;
}

export async function createDashboardForAi(
  organization: IOrganizationScope,
  input: IGenerateDashboardInput,
): Promise<IGeneratedDashboard> {
  const sources = await ownSources(input.dataSourceIds, organization);
  const provider = await chosenProvider(organization, input.providerId);
  if (provider === null) {
    throw new BadRequestException(
      "No AI provider is set up for this organization yet",
    );
  }

  const now = new Date();
  // The links name the dashboard they hang off, so its id is minted here
  // rather than left to the column default: one batch cannot read what an
  // earlier statement in the same batch generated.
  const dashboardId = randomUUID();
  const [rows] = await organization.db.batch([
    organization.db
      .insert(dashboard)
      .values({
        id: dashboardId,
        organizationId: organization.organizationId,
        name: input.name,
        createdAt: now,
        updatedAt: now,
      })
      .returning(),
    organization.db.insert(dashboardDataSource).values(
      sources.map((source) => ({
        organizationId: organization.organizationId,
        dashboardId,
        dataSourceId: source.id,
        createdAt: now,
      })),
    ),
  ]);
  const created = rows[0];
  if (created === undefined) {
    throw new NotFoundException("That dashboard could not be created");
  }

  return { dashboard: created, sources, provider, now };
}

export async function generateDashboardCharts(
  organization: IOrganizationScope,
  generated: IGeneratedDashboard,
  brief: string | undefined,
  turn: IStreamTurn,
): Promise<void> {
  const plan = await planCharts(
    turn,
    generated.provider,
    generated.dashboard.id,
    generated.sources,
    brief,
    organization,
  );

  if (plan.skipped.length > 0) {
    await turn.skipped(plan.skipped);
  }
  if (plan.problem !== null) {
    await turn.problem(plan.problem);
  }

  const response: IGenerateDashboardResponse = {
    dashboard: await dashboardDetail(generated.dashboard, organization),
    durationMs: Date.now() - generated.now.getTime(),
  };
  await turn.done(response);
}

export interface IDashboardAskContext {
  dashboard: DashboardRow;
  provider: AiProviderRow;
  analysed: Awaited<ReturnType<typeof analysisSources>>;
  widgets: Awaited<ReturnType<typeof readWidgets>>;
}

export async function prepareDashboardAsk(
  organization: IOrganizationScope,
  dashboardId: string,
  input: IAskDashboardInput,
): Promise<IDashboardAskContext> {
  const found = await getDashboardRow(organization, dashboardId);

  const provider = await chosenProvider(organization, input.providerId);
  if (provider === null) {
    throw new BadRequestException(
      "No AI provider is set up for this organization yet",
    );
  }

  const analysed = await analysisSources(found.id, organization);
  if (analysed.length === 0) {
    throw new BadRequestException(
      "Only Postgres sources can be analysed, and this dashboard has none connected",
    );
  }

  const widgets = await readWidgets(found.id, organization);

  return { dashboard: found, provider, analysed, widgets };
}

export async function askDashboardChanges(
  context: IDashboardAskContext,
  organization: IOrganizationScope,
  question: string,
  turn: IStreamTurn,
): Promise<void> {
  const proposal = await proposeChanges(
    turn,
    context.provider,
    context.dashboard.name,
    context.analysed,
    context.widgets,
    organization,
    question,
  );
  if (proposal === null) {
    await turn.problem(
      "That provider did not return a proposal. Check the key, the model id, and the base URL.",
    );
    return;
  }

  const response: IAskDashboardResponse = {
    proposal,
    providerName: context.provider.name,
    model: context.provider.model,
    durationMs: Date.now() - turn.startedAt,
  };
  await turn.done(response);
}

export async function applyDashboardProposal(
  organization: IOrganizationScope,
  dashboardId: string,
  actions: unknown[],
): Promise<IApplyProposalResponse> {
  const found = await getDashboardRow(organization, dashboardId);

  const analysed = await analysisSources(found.id, organization);
  const widgets = await readWidgets(found.id, organization);

  const applied = await applyChanges(
    found.id,
    actions,
    analysed,
    widgets,
    organization,
  );

  return {
    dashboard: await dashboardDetail(found, organization),
    applied,
  };
}
