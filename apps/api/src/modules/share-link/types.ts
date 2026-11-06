export interface ICreateShareLinkInput {
  dashboardId: string;
  expiresInDays: number | null;
}

export interface ICreatedShareLink {
  shareLink: import("./contracts").IShareLink;
  url: string;
  dashboardName: string;
}

export interface IRefreshedShareLink {
  shareLink: import("./contracts").IShareLink;
  dashboardName: string;
}
