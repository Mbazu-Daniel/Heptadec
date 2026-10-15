export interface ISavedQuery {
  id: string;
  dataSourceId: string;
  name: string;
  sql: string;
  createdAt: string;
  updatedAt: string;
}

export interface ISavedQueryListResponse {
  savedQueries: ISavedQuery[];
}

export interface IRecordRunRequest {
  sql: string;
}

export interface ICreateSavedQueryRequest {
  name: string;
  sql: string;
}

export interface IUpdateSavedQueryRequest {
  name?: string;
  sql?: string;
}

export interface ISavedQueryResponse {
  savedQuery: ISavedQuery;
}

export interface IQueryVersion {
  id: string;
  name: string;
  sql: string;
  createdAt: string;
}

export interface IQueryVersionListResponse {
  versions: IQueryVersion[];
}
