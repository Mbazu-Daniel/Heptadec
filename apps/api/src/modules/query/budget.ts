export const MAX_ROWS = 10_000;

export const MAX_BYTES = 5 * 1024 * 1024;

export interface IResultBudget {
  maxRows: number;
  maxBytes: number;
}

export const DEFAULT_RESULT_BUDGET: IResultBudget = {
  maxRows: MAX_ROWS,
  maxBytes: MAX_BYTES,
};

export interface IBudgetedRows {
  rows: Array<Record<string, unknown>>;
  truncated: boolean;
}

export function applyBudget(
  rows: Array<Record<string, unknown>>,
  budget: IResultBudget = DEFAULT_RESULT_BUDGET,
): IBudgetedRows {
  const visible = rows.slice(0, budget.maxRows);
  return {
    rows: visible,
    truncated: rows.length > visible.length || byteLength(visible) > budget.maxBytes,
  };
}

function byteLength(rows: Array<Record<string, unknown>>): number {
  try {
    return JSON.stringify(rows, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    ).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
