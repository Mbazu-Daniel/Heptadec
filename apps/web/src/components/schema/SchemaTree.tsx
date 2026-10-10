import { useState } from "react";
import {
  IconAlignLeft,
  IconChevronDown,
  IconChevronRight,
  IconClock,
  IconFingerprint,
  IconHash,
  IconKey,
  IconSearch,
  IconTable,
  IconToggleRight,
  IconBox,
} from "@tabler/icons-react";
import type {
  ISchemaRelationship,
  ISchemaTable,
} from "@heptadec/api/schema-contracts";
import { columnKind, referencesFrom } from "./schema-model";

function matches(table: ISchemaTable, term: string): boolean {
  return (
    table.name.toLowerCase().includes(term) ||
    table.columns.some((column) => column.name.toLowerCase().includes(term))
  );
}

export function ColumnGlyph({
  dataType,
  foreign,
  size = 13,
}: {
  dataType: string;
  foreign: boolean;
  size?: number;
}) {
  if (foreign) {
    return <IconKey size={size} className="text-cyan" aria-label="Foreign key" />;
  }
  switch (columnKind(dataType)) {
    case "number":
      return <IconHash size={size} />;
    case "text":
      return <IconAlignLeft size={size} />;
    case "bool":
      return <IconToggleRight size={size} />;
    case "time":
      return <IconClock size={size} />;
    case "uuid":
      return <IconFingerprint size={size} />;
    case "binary":
      return <IconBox size={size} />;
    case "other":
      return <IconTable size={size} />;
  }
}

export function SchemaTree({
  tables,
  relationships,
  selected,
  onSelect,
}: {
  tables: ISchemaTable[];
  relationships: ISchemaRelationship[];
  selected: string | null;
  onSelect: (table: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(tables.map((table) => table.name)),
  );

  const query = term.trim().toLowerCase();
  const visible = query
    ? tables.filter((table) => matches(table, query))
    : tables;

  function toggle(name: string): void {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  return (
    <div className="erd erd-tree flex min-h-0 w-full flex-col self-stretch overflow-hidden">
      <div className="border-b border-border p-2">
        <label className="relative flex items-center">
          <IconSearch
            size={14}
            className="pointer-events-none absolute left-2 text-muted-foreground"
          />
          <input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Search tables and columns"
            aria-label="Search tables and columns"
            className="h-7 w-full rounded-md border border-input bg-background pl-7 pr-7 text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring/50"
          />
          <kbd className="pointer-events-none absolute right-2 font-mono text-[10px] text-muted-foreground">
            /
          </kbd>
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto py-1">
        <div className="erd-tree__row cursor-default hover:bg-transparent">
          <span className="erd-tree__toggle" />
          <span className="erd-tree__label">Tables</span>
          <span className="erd-tree__type">{tables.length}</span>
        </div>

        {visible.map((table) => {
          const isCollapsed = collapsed.has(table.name) && query === "";
          const carries = referencesFrom(table.name, relationships);
          return (
            <div key={table.name}>
              <div
                className="erd-tree__row"
                data-selected={selected === table.name}
                onClick={() => onSelect(table.name)}
              >
                <button
                  type="button"
                  className="erd-tree__toggle"
                  aria-label={
                    isCollapsed ? `Expand ${table.name}` : `Collapse ${table.name}`
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    toggle(table.name);
                  }}
                >
                  {isCollapsed ? (
                    <IconChevronRight size={13} />
                  ) : (
                    <IconChevronDown size={13} />
                  )}
                </button>
                <IconTable size={14} className="shrink-0 text-muted-foreground" />
                <span className="erd-tree__label font-mono">{table.name}</span>
                <span className="erd-tree__type">
                  {table.columns.length}
                </span>
              </div>

              {isCollapsed ? null : (
                <div className="erd-tree__children">
                  <div className="erd-tree__group">Columns</div>
                  {table.columns.map((column) => {
                    const foreign = carries.get(column.name);
                    const hit =
                      query !== "" &&
                      !table.name.toLowerCase().includes(query) &&
                      column.name.toLowerCase().includes(query);
                    return (
                      <div
                        key={column.name}
                        className="erd-tree__row"
                        data-dimmed={query !== "" && !hit && !table.name.toLowerCase().includes(query)}
                        onClick={() => onSelect(table.name)}
                      >
                        <span className="erd-tree__toggle" />
                        <span
                          className="shrink-0"
                          title={
                            foreign
                              ? `References ${foreign.toTable}.${foreign.toColumn}`
                              : undefined
                          }
                        >
                          <ColumnGlyph
                            dataType={column.dataType}
                            foreign={foreign !== undefined}
                          />
                        </span>
                        <span className="erd-tree__label">{column.name}</span>
                        <span className="erd-tree__type">{column.dataType}</span>
                      </div>
                    );
                  })}

                  {table.indexedColumns.length === 0 ? null : (
                    <>
                      <div className="erd-tree__group">Indexes</div>
                      {table.indexedColumns.map((column) => (
                        <div
                          key={column}
                          className="erd-tree__row"
                          onClick={() => onSelect(table.name)}
                        >
                          <span className="erd-tree__toggle" />
                          <IconKey
                            size={13}
                            className="shrink-0 text-muted-foreground"
                          />
                          <span className="erd-tree__label">{column}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center font-mono text-xs text-muted-foreground">
            No table matches.
          </p>
        ) : null}
      </div>
    </div>
  );
}
