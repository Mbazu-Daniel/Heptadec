import type { SqlDialect } from "./contracts";

// How an identifier is written depends on the dialect, and getting it wrong is
// an injection rather than a syntax error. One place decides it, so the query
// composer, the MCP tools and the web client cannot drift apart.

export function quoteIdentifier(dialect: SqlDialect, name: string): string {
  if (dialect === "mysql" || dialect === "clickhouse") {
    return `\`${name.replace(/`/g, "``")}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}
