import type { SqlDialect } from "@heptadec/api/data-source-contracts";

// Each engine spells an identifier and a text cast differently, and the query
// runner builds both on the fly, so the spelling lives here rather than in the
// component.
export function quoteIdentifier(dialect: SqlDialect, name: string): string {
  if (dialect === "mysql" || dialect === "clickhouse") {
    return `\`${name.replace(/`/g, "``")}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

export function castToText(dialect: SqlDialect, column: string): string {
  if (dialect === "clickhouse") {
    return `toString(${column})`;
  }
  if (dialect === "mysql") {
    return `CAST(${column} AS CHAR)`;
  }
  return `CAST(${column} AS TEXT)`;
}
