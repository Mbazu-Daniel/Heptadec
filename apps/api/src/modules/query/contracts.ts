// MongoDB has no SQL: a query is a collection plus the aggregation pipeline to
// run against it, which is what the editor holds and what the AI is asked for.
export interface IMongoPipeline {
  collection: string;
  pipeline: Record<string, unknown>[];
}

/** A Quickwit search: which index to search, and the query itself. A search
 * names its own index, because a Quickwit source holds many and none of them is
 * the source. */
export interface ISearchStatement {
  index: string;
  query: string;
}

/**
 * A Run as it arrives: exactly one of these keys, named by the language of the
 * source it is for. Every key here has a runner in `runners.ts`, so a language
 * with no runner cannot be asked for and one that is forgotten cannot be run.
 */
export interface IQueryRequest {
  sql?: string;
  command?: string;
  mongo?: IMongoPipeline;
  search?: ISearchStatement;
}

export interface IResultGrid {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  truncated: boolean;
}

export interface IQueryResponse extends IResultGrid {
  columnTypes: string[];
  rowCount: number;
  durationMs: number;
}

export function gridNumber(raw: unknown): number | null {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export interface IExplainNode {
  nodeType: string;
  relationName: string | null;
  startupCost: number;
  totalCost: number;
  planRows: number;
  planWidth: number;
  children: IExplainNode[];
}

export interface IExplainResponse {
  plan: IExplainNode;
}

export interface IRedisQueryResponse extends IResultGrid {
  durationMs: number;
}
