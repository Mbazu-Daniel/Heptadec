import type { ISchemaResponse } from "../schema/contracts";

const CHARACTER_BUDGET = 12_000;

const MAX_TABLES = 120;

const COLUMN_BUDGET = 2_400;

export function schemaContext(schema: ISchemaResponse): string {
  const lines: string[] = [
    `Database: ${schema.database}`,
    `Schema: ${schema.schemaName}`,
    "",
  ];

  for (const relationship of schema.relationships) {
    lines.push(
      `-- ${relationship.fromTable}.${relationship.fromColumn} -> ${relationship.toTable}.${relationship.toColumn}`,
    );
  }

  let used = lines.join("\n").length;
  let tables = 0;

  for (const table of schema.tables) {
    const described = describe(table);
    if (used + described.length > CHARACTER_BUDGET) {
      lines.push(`-- ${schema.tables.length - tables} more tables omitted for length`);
      break;
    }
    lines.push(described);
    used += described.length;
    tables += 1;
    if (tables >= MAX_TABLES) {
      lines.push(`-- ${schema.tables.length - tables} more tables omitted for length`);
      break;
    }
  }

  return lines.join("\n");
}

function describe(table: ISchemaResponse["tables"][number]): string {
  const columns = table.columns.map((column) => {
    const parts = [column.name, column.dataType];
    if (!column.nullable) {
      parts.push("not null");
    }
    if (column.primaryKey) {
      parts.push("primary key");
    }
    return parts.join(" ");
  });
  const line = `${table.name}(${columns.join(", ")})`;
  return line.length <= COLUMN_BUDGET ? line : `${line.slice(0, COLUMN_BUDGET)}…`;
}
