import type { DataSourceKind } from "../data-source/contracts";

export type ChartType = "bar" | "line" | "pie";

export interface IDashboard {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface IDashboardSource {
  dataSourceId: string;
  name: string;
  kind: DataSourceKind;
  /** Whether the app's tooling covers this source, which is what a dashboard
   * needs to be described from. Said here by the server rather than worked out
   * by the client from the kind, which is how the offer and the gate drift. */
  tooling: boolean;
}

export interface IWidget {
  id: string;
  dashboardId: string;
  savedQueryId: string;
  chartType: ChartType;
  title: string;
  labelColumn: string;
  valueColumn: string;
  createdAt: string;
  updatedAt: string;
}

export interface IDashboardWithWidgets extends IDashboard {
  widgets: IWidget[];
  sources: IDashboardSource[];
}

export interface IDashboardListResponse {
  dashboards: IDashboard[];
}

export interface IDashboardResponse {
  dashboard: IDashboardWithWidgets;
}

export interface ICreateDashboardRequest {
  name: string;
  dataSourceIds: string[];
}

export interface IUpdateDashboardRequest {
  name?: string;
  dataSourceIds?: string[];
}

export interface IGenerateDashboardRequest {
  name: string;
  dataSourceIds: string[];
  brief?: string;
}

export interface IUpdateDashboardRequest {
  name?: string;
}

export interface ICreateWidgetRequest {
  savedQueryId: string;
  chartType: ChartType;
  title: string;
  labelColumn: string;
  valueColumn: string;
}

export interface IUpdateWidgetRequest {
  chartType?: ChartType;
  title?: string;
  labelColumn?: string;
  valueColumn?: string;
}

export interface IWidgetResponse {
  widget: IWidget;
}

export interface IWidgetPoint {
  label: string;
  value: number;
}

export interface IWidgetData {
  points: IWidgetPoint[];
  rowCount: number;
  truncated: boolean;
  durationMs: number;
  ranAt: string | null;
  stale: boolean;
}

export interface IAddChartAction {
  kind: "add";
  sourceId: string;
  title: string;
  sql: string;
  chartType: ChartType;
  labelColumn: string;
  valueColumn: string;
}

export interface IUpdateChartAction {
  kind: "update";
  widgetId: string;
  title?: string;
  chartType?: ChartType;
  labelColumn?: string;
  valueColumn?: string;
  sql?: string;
}

export interface IRemoveChartAction {
  kind: "remove";
  widgetId: string;
}

export type IProposalAction = IAddChartAction | IUpdateChartAction | IRemoveChartAction;

export interface IDashboardProposal {
  summary: string;
  actions: IProposalAction[];
}

export interface IAskDashboardResponse {
  proposal: IDashboardProposal;
  providerName: string;
  model: string;
  durationMs: number;
}

export interface IGenerateDashboardResponse {
  dashboard: IDashboardWithWidgets;
  durationMs: number;
}

export interface IApplyProposalRequest {
  actions: IProposalAction[];
}

export interface IAppliedAction {
  index: number;
  kind: IProposalAction["kind"];
  widgetId: string | null;
  problem: string | null;
}

export interface IApplyProposalResponse {
  dashboard: IDashboardWithWidgets;
  applied: IAppliedAction[];
}
