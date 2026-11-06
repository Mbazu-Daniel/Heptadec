import type { IConnectionInput } from "./connection";

export type ICreateDataSourceInput = IConnectionInput;

export type ITestConnectionInput = IConnectionInput;

export interface IUpdateDataSourceInput {
  body: Record<string, unknown>;
}

export interface IPreviewInput {
  object: unknown;
  limit: unknown;
  query: unknown;
}

export interface IRemovedDataSource {
  id: string;
  name: string;
}
