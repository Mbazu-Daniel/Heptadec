import type {
  ISchemaRelationship,
  ISchemaTable,
} from "@heptadec/api/schema-contracts";

export type ColumnKind =
  | "number"
  | "text"
  | "bool"
  | "time"
  | "uuid"
  | "binary"
  | "other";

const NUMERIC = [
  "smallint",
  "integer",
  "bigint",
  "decimal",
  "numeric",
  "real",
  "double precision",
  "money",
  "smallserial",
  "serial",
  "bigserial",
];

function baseName(dataType: string): string {
  const paren = dataType.indexOf("(");
  return (paren === -1 ? dataType : dataType.slice(0, paren))
    .trim()
    .toLowerCase();
}

export function columnKind(dataType: string): ColumnKind {
  const base = baseName(dataType);
  if (base.includes("timestamp") || base === "date" || base === "time") {
    return "time";
  }
  if (base === "uuid") {
    return "uuid";
  }
  if (base === "boolean") {
    return "bool";
  }
  if (NUMERIC.includes(base)) {
    return "number";
  }
  if (base.includes("char") || base === "text" || base === "citext") {
    return "text";
  }
  if (base === "bytea") {
    return "binary";
  }
  return "other";
}

export const CARD_WIDTH = 300;

const HEADER_HEIGHT = 38;

const TAB_HEIGHT = 30;

const ROW_HEIGHT = 26;

const CARD_PADDING = 10;

export const MAX_VISIBLE_COLUMNS = 12;

const COLUMN_GAP = 96;

const ROW_GAP = 32;

export function hiddenColumnCount(table: ISchemaTable): number {
  return Math.max(0, table.columns.length - MAX_VISIBLE_COLUMNS);
}

export function columnListHeight(table: ISchemaTable): number {
  const shown = Math.min(table.columns.length, MAX_VISIBLE_COLUMNS);
  const overflow = hiddenColumnCount(table) > 0 ? 1 : 0;
  return (shown + overflow) * ROW_HEIGHT;
}

export function cardHeight(table: ISchemaTable): number {
  return HEADER_HEIGHT + TAB_HEIGHT + columnListHeight(table) + CARD_PADDING;
}

export interface IPlacedTable {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export function arrangeTables(
  tables: ISchemaTable[],
  relationships: ISchemaRelationship[],
): IPlacedTable[] {
  const depths = new Map<string, number>();
  const measuring = new Set<string>();
  const names = new Set(tables.map((table) => table.name));

  function depthOf(name: string): number {
    const known = depths.get(name);
    if (known !== undefined) {
      return known;
    }
    if (measuring.has(name)) {
      return 0;
    }
    measuring.add(name);
    let depth = 0;
    for (const edge of relationships) {
      if (edge.fromTable === name && names.has(edge.toTable)) {
        depth = Math.max(depth, depthOf(edge.toTable) + 1);
      }
    }
    measuring.delete(name);
    depths.set(name, depth);
    return depth;
  }

  const columns = new Map<number, ISchemaTable[]>();
  for (const table of tables) {
    const depth = depthOf(table.name);
    const column = columns.get(depth);
    if (column) {
      column.push(table);
    } else {
      columns.set(depth, [table]);
    }
  }

  const placed: IPlacedTable[] = [];
  for (const [depth, column] of [...columns].sort((a, b) => a[0] - b[0])) {
    let y = 24;
    for (const table of [...column].sort((a, b) => a.name.localeCompare(b.name))) {
      const height = cardHeight(table);
      placed.push({
        id: table.name,
        x: 24 + depth * (CARD_WIDTH + COLUMN_GAP),
        y,
        width: CARD_WIDTH,
        height,
      });
      y += height + ROW_GAP;
    }
  }
  return placed;
}

export function referencedBy(
  table: string,
  relationships: ISchemaRelationship[],
): Map<string, ISchemaRelationship> {
  const pointing = new Map<string, ISchemaRelationship>();
  for (const edge of relationships) {
    if (edge.toTable === table) {
      pointing.set(edge.toColumn, edge);
    }
  }
  return pointing;
}

export function referencesFrom(
  table: string,
  relationships: ISchemaRelationship[],
): Map<string, ISchemaRelationship> {
  const pointing = new Map<string, ISchemaRelationship>();
  for (const edge of relationships) {
    if (edge.fromTable === table) {
      pointing.set(edge.fromColumn, edge);
    }
  }
  return pointing;
}
