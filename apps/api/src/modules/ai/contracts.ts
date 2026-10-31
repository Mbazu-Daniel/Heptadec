import type { IMongoPipeline, ISearchStatement } from "../query/contracts";
import type { QueryLanguage } from "../data-source/contracts";
import type { IAiProviderSpec } from "./catalog";

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
  catalog: IAiProviderSpec[];
}

export interface IAiModel {
  id: string;
  label: string | null;
}

export interface IListModelsResponse {
  source: "provider" | "suggestions";
  models: IAiModel[];
}

export interface IListProviderModelsRequest {
  provider: string;
  apiKey: string;
  baseUrl?: string;
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

export interface IUpdateAiProviderRequest {
  id: string;
  name?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
  isDefault?: boolean;
  baseUrl?: string;
}

export interface IUpdateAiProviderResponse extends IAiProvider {}

export interface IDeleteAiProviderResponse {
  removed: string;
}

export interface IGenerateQueryRequest {
  dataSourceIds?: string[];
  question: string;
  providerId?: string;
}

export interface IGenerateQueryResponse {
  chatId: string;
  dataSourceId: string;
  dataSourceName: string;
  language: QueryLanguage;
  sql: string | null;
  pipeline: IMongoPipeline | null;
  command: string | null;
  search: ISearchStatement | null;
  answered: boolean;
  providerName: string;
  model: string;
  durationMs: number;
}

export const ANSWER_EVENTS = {
  status: "status",
  delta: "delta",
  skipped: "skipped",
  problem: "problem",
  done: "done",
} as const;

export type AnswerEvent = (typeof ANSWER_EVENTS)[keyof typeof ANSWER_EVENTS];

export interface IAnswerStatus {
  message: string;
}

export interface IAnswerDelta {
  text: string;
}

export interface IAnswerSkipped {
  titles: string[];
}

export interface IAnswerProblem {
  message: string;
}
