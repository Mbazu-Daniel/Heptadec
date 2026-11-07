import type { ISavedQueryResponse } from "./contracts";

export interface ICreateSavedQueryInput {
  dataSourceId: string;
  name: string;
  sql: string;
}

export interface IRecordRunInput {
  dataSourceId: string;
  sql: string;
}

export interface IRecordRunResult {
  response: ISavedQueryResponse;
  created: boolean;
}

export interface IUpdateSavedQueryInput {
  savedQueryId: string;
  name?: string;
  sql?: string;
}

export interface IRestoreInput {
  savedQueryId: string;
  versionId: string;
}

export interface IRemovedSavedQuery {
  id: string;
  name: string;
}
