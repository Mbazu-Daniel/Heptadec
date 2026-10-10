import type { IQueryResponse } from "@heptadec/api/query-contracts";

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(result: IQueryResponse): string {
  const header = result.columns.map(csvCell).join(",");
  const body = result.rows.map((row) =>
    result.columns.map((column) => csvCell(row[column])).join(","),
  );
  return [header, ...body].join("\r\n");
}

export function toJson(result: IQueryResponse): string {
  return JSON.stringify(
    { columns: result.columns, columnTypes: result.columnTypes, rows: result.rows },
    null,
    2,
  );
}

function download(filename: string, mime: string, text: string): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportCsv(result: IQueryResponse, name: string): void {
  download(`${name}.csv`, "text/csv", toCsv(result));
}

export function exportJson(result: IQueryResponse, name: string): void {
  download(`${name}.json`, "application/json", toJson(result));
}
