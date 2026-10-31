import type { IGenerateQueryResponse } from "@heptadec/api/ai-contracts";
import type { IMongoPipeline, ISearchStatement } from "@heptadec/api/query-contracts";

/**
 * What an Answer handed back, as one variant rather than four nullable fields.
 * The server fills exactly one of them per source language, so the choice is
 * made once here instead of at every runner that asks.
 */
export type IAnswerDraft =
  | { kind: "sql"; sql: string }
  | { kind: "pipeline"; pipeline: IMongoPipeline }
  | { kind: "command"; command: string }
  | { kind: "search"; search: ISearchStatement }
  | { kind: "none" };

export function draftOf(answer: IGenerateQueryResponse): IAnswerDraft {
  if (answer.sql !== null) {
    return { kind: "sql", sql: answer.sql };
  }
  if (answer.pipeline !== null) {
    return { kind: "pipeline", pipeline: answer.pipeline };
  }
  if (answer.command !== null) {
    return { kind: "command", command: answer.command };
  }
  if (answer.search !== null) {
    return { kind: "search", search: answer.search };
  }
  return { kind: "none" };
}
