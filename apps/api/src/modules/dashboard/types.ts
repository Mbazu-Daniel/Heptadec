import type { ChartType } from "./contracts";

export interface ICreateDashboardInput {
  name: string;
  dataSourceIds: string[];
}

export interface IUpdateDashboardInput {
  name?: string;
  dataSourceIds?: string[];
}

export interface ICreateWidgetInput {
  savedQueryId: string;
  chartType: ChartType;
  title: string;
  labelColumn: string;
  valueColumn: string;
}

export interface IUpdateWidgetInput {
  chartType: ChartType;
  title: string;
  labelColumn: string;
  valueColumn: string;
}

export interface IGenerateDashboardInput {
  name: string;
  dataSourceIds: string[];
  brief?: string;
  providerId: unknown;
}

export interface IAskDashboardInput {
  question: string;
  providerId: unknown;
}
