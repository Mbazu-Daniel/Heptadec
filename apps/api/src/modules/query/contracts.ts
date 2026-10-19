export interface IMongoPipeline {
  collection: string;
  pipeline: Record<string, unknown>[];
}

export interface ISearchStatement {
  index: string;
  query: string;
}

export type FilterOp =
  | "="
  | "<>"
  | ">"
  | ">="
  | "<"
  | "<="
  | "contains"
  | "is null"
  | "is not null";

export interface IQueryFilter {
  column: string;
  op: FilterOp;
  value: string;
}

export interface IQuerySort {
  column: string;
  dir: "asc" | "desc";
}

export interface IQueryRefine {
  filter?: IQueryFilter | null;
  sort?: IQuerySort | null;
}

export interface IQueryRequest {
  sql?: string;
  command?: string;
  mongo?: IMongoPipeline;
  search?: ISearchStatement;
  refine?: IQueryRefine;
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
  statement?: string;
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
