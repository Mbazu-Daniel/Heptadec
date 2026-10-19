import type { SqlDialect } from "@heptadec/api/data-source-contracts";

export function quoteIdentifier(dialect: SqlDialect, name: string): string {
  if (dialect === "mysql" || dialect === "clickhouse") {
    return `\`${name.replace(/`/g, "``")}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}
