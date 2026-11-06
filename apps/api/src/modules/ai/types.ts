import type { IAiProvider } from "./contracts";
import type { AiProviderRow } from "@heptadec/db";
import type { IMongoPipeline, ISearchStatement } from "../query/contracts";
import type { QueryLanguage } from "../data-source/contracts";
import type { IStoredConnection } from "../data-source/connection";

export interface ICreateAiProviderInput {
  name: string;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string | undefined;
  isDefault: boolean;
}

export interface IListProviderModelsInput {
  provider: string;
  apiKey: string;
  baseUrl: string | undefined;
}

export interface IAskInput {
  question: string;
  providerId: unknown;
  dataSourceIds: string[];
}

export interface IAiProviderList {
  providers: IAiProvider[];
  catalog: IAiProviderSpec[];
}

export type AiProtocol = "openai-compatible";

export interface IAiProviderSpec {
  id: string;
  label: string;
  baseUrl: string;
  needsBaseUrl: boolean;
  exampleBaseUrl?: string;
  protocol: AiProtocol | "anthropic";
  models?: readonly string[];
}

export interface IProviderEndpoint {
  spec: IAiProviderSpec;
  baseUrl: string;
}

export interface IModel {
  id: string;
  label: string | null;
}

export interface IModelConfig {
  provider: string;
  baseUrl: string | null;
  apiKey: string;
}

export type ModelListing =
  | { kind: "models"; models: IModel[] }
  | { kind: "unsupported" }
  | { kind: "refused" }
  | { kind: "unreachable" }
  | { kind: "status"; status: number };

export interface IAnswerSource {
  readonly name: string;
  read(): Promise<string>;
}

export interface IAnswerCall {
  provider: AiProviderRow;
  instructions: string;
  prompt: string;
}

export interface IGeneratedQuery {
  sql: string | null;
  pipeline: IMongoPipeline | null;
  command: string | null;
  search: ISearchStatement | null;
  outcome: "answered" | "declined" | "empty" | "unreadable";
}

export type IQueryDraft = Pick<
  IGeneratedQuery,
  "sql" | "pipeline" | "command" | "search"
>;

export interface IAskStyle {
  language: QueryLanguage;
  instructions: string;
  context(sourceId: string, stored: IStoredConnection): Promise<string>;
  readAnswer(text: string): IGeneratedQuery;
}
