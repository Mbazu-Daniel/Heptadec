import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@heptadec/db";
import { BadRequestException, NotFoundException } from "../../common/exceptions";
import type { IOrganizationScope } from "../../common/session/current-organization";
import type {
  ChartType,
  IDashboard,
  IDashboardSource,
  IDashboardWithWidgets,
  IWidget,
} from "./contracts";

const { dashboard, dashboardDataSource, dataSource, widget } = schema;

type DashboardRow = typeof dashboard.$inferSelect;

export function toDashboard(row: DashboardRow): IDashboard {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toWidget(row: typeof widget.$inferSelect): IWidget {
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    savedQueryId: row.savedQueryId,
    chartType: row.chartType as ChartType,
    title: row.title,
    labelColumn: row.labelColumn,
    valueColumn: row.valueColumn,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function readDashboardSources(
  dashboardId: string,
  organization: IOrganizationScope,
): Promise<IDashboardSource[]> {
  return db
    .select({
      dataSourceId: dataSource.id,
      name: dataSource.name,
      kind: dataSource.kind,
    })
    .from(dashboardDataSource)
    .innerJoin(dataSource, eq(dashboardDataSource.dataSourceId, dataSource.id))
    .where(
      and(
        eq(dashboardDataSource.dashboardId, dashboardId),
        organization.where(dashboardDataSource.organizationId),
        eq(dataSource.organizationId, organization.organizationId),
      ),
    )
    .orderBy(dataSource.name);
}

export async function readWidgets(
  dashboardId: string,
  organization: IOrganizationScope,
): Promise<IWidget[]> {
  const rows = await db
    .select()
    .from(widget)
    .where(
      and(
        eq(widget.dashboardId, dashboardId),
        organization.where(widget.organizationId),
      ),
    )
    .orderBy(widget.createdAt);
  return rows.map(toWidget);
}

export async function dashboardDetail(
  row: DashboardRow,
  organization: IOrganizationScope,
): Promise<IDashboardWithWidgets> {
  const [widgets, sources] = await Promise.all([
    readWidgets(row.id, organization),
    readDashboardSources(row.id, organization),
  ]);
  return { ...toDashboard(row), widgets, sources };
}

export async function ownSources(
  dataSourceIds: string[],
  organization: IOrganizationScope,
): Promise<Array<typeof dataSource.$inferSelect>> {
  const wanted = [...new Set(dataSourceIds)];
  if (wanted.length === 0) {
    throw new BadRequestException("Connect at least one data source");
  }

  const rows = await db
    .select()
    .from(dataSource)
    .where(
      and(
        inArray(dataSource.id, wanted),
        eq(dataSource.organizationId, organization.organizationId),
      ),
    );

  if (rows.length !== wanted.length) {
    throw new NotFoundException("One of those data sources does not exist");
  }
  return rows;
}

export async function replaceDashboardSources(
  dashboardId: string,
  organization: IOrganizationScope,
  dataSourceIds: string[],
): Promise<void> {
  const sources = await ownSources(dataSourceIds, organization);

  await db
    .delete(dashboardDataSource)
    .where(
      and(
        eq(dashboardDataSource.dashboardId, dashboardId),
        organization.where(dashboardDataSource.organizationId),
      ),
    );

  const now = new Date();
  await db.insert(dashboardDataSource).values(
    sources.map((source) => ({
      organizationId: organization.organizationId,
      dashboardId,
      dataSourceId: source.id,
      createdAt: now,
    })),
  );
}
