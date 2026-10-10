export interface IAiProvider {
  id: string;
  name: string;
  provider: string;
  providerLabel: string;
  model: string;
  baseUrl: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface IAiProviderListResponse {
  providers: IAiProvider[];
  catalog: Array<{
    id: string;
    label: string;
    baseUrl: string;
    needsBaseUrl: boolean;
    exampleBaseUrl?: string;
  }>;
}

export interface IAiModel {
  id: string;
  label: string | null;
}

export interface IListModelsResponse {
  source: "provider" | "suggestions";
  models: IAiModel[];
}

export interface ICreateAiProviderRequest {
  name: string;
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey: string;
  isDefault?: boolean;
}

export interface ICreateAiProviderResponse extends IAiProvider {}

export interface IDeleteAiProviderResponse {
  removed: string;
}

export interface IGenerateQueryRequest {
  dataSourceId: string;
  question: string;
  providerId?: string;
}

export interface IGenerateQueryResponse {
  chatId: string;
  sql: string | null;
  answered: boolean;
  providerName: string;
  model: string;
  durationMs: number;
}
