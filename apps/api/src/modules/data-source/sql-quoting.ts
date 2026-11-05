import type { SqlDialect } from "./contracts";


export function quoteIdentifier(dialect: SqlDialect, name: string): string {
  if (dialect === "mysql" || dialect === "clickhouse") {
    return `\`${name.replace(/`/g, "``")}\``;
  }
  return `"${name.replace(/"/g, '""')}"`;
}
