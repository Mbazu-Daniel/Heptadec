import type { IMongoPipeline, ISearchStatement } from "../query/contracts";
import type { QueryLanguage } from "../data-source/contracts";

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

/** A provider that is not saved yet, so the form can offer its models first. */
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

export interface IDeleteAiProviderResponse {
  removed: string;
}

export interface IGenerateQueryRequest {
  /**
   * The sources to search. Leave it out, or send none, to search every source
   * this organization can ask about.
   */
  dataSourceIds?: string[];
  question: string;
  providerId?: string;
}

export interface IGenerateQueryResponse {
  chatId: string;
  /**
   * Which source the answer came from, so a question spanning several sources
   * never leaves which one answered in doubt.
   */
  dataSourceId: string;
  dataSourceName: string;
  /** The language the answer is written in, so the client knows how to run it. */
  language: QueryLanguage;
  sql: string | null;
  pipeline: IMongoPipeline | null;
  /** Set for a command source, where the answer is a Redis command. */
  command: string | null;
  /** Set for a search source, where the answer names an index and a query. */
  search: ISearchStatement | null;
  answered: boolean;
  providerName: string;
  model: string;
  durationMs: number;
}

/**
 * The Answer's stream: the phases it goes through, in the order they arrive.
 *
 * The server writes these names and the web client reads them back, so they
 * live here — the one place the two sides agree on.
 */
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
