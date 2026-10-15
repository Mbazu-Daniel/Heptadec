import type { IQueryResponse } from "../query/contracts";

export interface ICachedResult {
  id: string;
  savedQueryId: string;
  ranAt: string;
  ttlSeconds: number;
  stale: boolean;
  grid: IQueryResponse;
}
