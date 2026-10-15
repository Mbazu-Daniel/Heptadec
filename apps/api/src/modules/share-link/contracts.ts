import type { ChartType, IWidgetPoint } from "../dashboard/contracts";

export interface ISharedWidget {
  id: string;
  title: string;
  chartType: ChartType;
  points: IWidgetPoint[];
}

export interface ISharedDashboard {
  name: string;
  widgets: ISharedWidget[];
}

export interface IShareLink {
  id: string;
  dashboardId: string;
  expiresAt: string | null;
  createdAt: string;
}

export interface IShareLinkListResponse {
  shareLinks: IShareLink[];
}

export interface IShareLinkResponse {
  shareLink: IShareLink;
  url: string;
}

export interface ICreateShareLinkRequest {
  expiresInDays?: number;
}

export interface ISharedDashboardResponse {
  dashboard: ISharedDashboard;
}
