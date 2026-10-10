import { useEffect, useState, type ReactNode } from "react";
import { IconChevronDown, IconLayoutGrid, IconTerminal } from "@tabler/icons-react";
import type { IDataSource } from "@heptadec/api/data-source-contracts";
import type { ISchemaResponse } from "@heptadec/api/schema-contracts";
import { fetchSchema, messageFor } from "../../api";
import { Alert, EmptyState } from "../ui/feedback";
import { Button } from "../ui/button";
import { SchemaTree } from "./SchemaTree";
import { ErdCanvas } from "./ErdCanvas";
import { QueryRunner } from "./QueryRunner";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../ui/resizable";
import { SavedQueriesPanel } from "./SavedQueriesPanel";
import type { ICrumb } from "../workspace";

interface IRunRequest {
  sql: string;
  nonce: number;
}

const TABS = [
  { id: "overview", label: "Overview", icon: IconLayoutGrid },
  { id: "query", label: "Query", icon: IconTerminal },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function SchemaBrowser({
  source,
  sources,
  onTrail,
  onOpenSource,
  onBack,
  onRemove,
  onBrowseRows,
}: {
  source: IDataSource;
  sources: IDataSource[];
  onTrail?: (crumbs: ICrumb[]) => void;
  onOpenSource: (id: string) => void;
  onBack: () => void;
  onRemove: (source: IDataSource) => void;
  onBrowseRows: (source: IDataSource, back: () => void) => ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("overview");
  const [schema, setSchema] = useState<ISchemaResponse | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [browsingRows, setBrowsingRows] = useState(false);
  const [runRequest, setRunRequest] = useState<IRunRequest | null>(null);
  const [queriesToken, setQueriesToken] = useState(0);
  const [editorSql, setEditorSql] = useState("");

  useEffect(() => {
    let live = true;
    setSchema(null);
    setProblem(null);
    setSelectedTable(null);
    setLoaded(false);
    setEditorSql("");
    setRunRequest(null);
    setTab("overview");
    fetchSchema(source.id).then(
      (found) => {
        if (live) {
          setSchema(found);
          setLoaded(true);
        }
      },
      (caught: unknown) => {
        if (live) {
          setProblem(messageFor(caught, "That structure could not be read."));
        }
      },
    );
    return () => {
      live = false;
    };
  }, [source.id]);

  useEffect(() => {
    const current = TABS.find((entry) => entry.id === tab);
    onTrail?.([
      { label: source.name },
      { label: current?.label ?? tab },
    ]);
  }, [onTrail, source.name, tab]);

  if (browsingRows) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {onBrowseRows(source, () => setBrowsingRows(false))}
      </div>
    );
  }
  async function remove(): Promise<void> {
    setRemoving(true);
    try {
      await onRemove(source);
      onBack();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <Button variant="ghost" onClick={onBack} className="h-7 px-2 text-xs">
          Back
        </Button>
        <label className="relative flex items-center">
          <select
            value={source.id}
            onChange={(event) => onOpenSource(event.target.value)}
            aria-label="Choose a data source"
            className="h-7 appearance-none rounded-md border border-border bg-background pl-2 pr-6 font-mono text-xs text-foreground outline-none focus-visible:border-ring/50"
          >
            {sources.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
          <IconChevronDown
            size={13}
            className="pointer-events-none absolute right-1.5 text-muted-foreground"
          />
        </label>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {schema === null
            ? "reading…"
            : `${schema.tables.length} tables · ${schema.relationships.length} foreign keys`}
        </span>
        <Button
          variant="ghost"
          onClick={() => setBrowsingRows(true)}
          className="h-7 px-2 text-xs"
        >
          Browse rows
        </Button>
        {confirmRemove ? (
          <span className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">
              Remove this source?
            </span>
            <Button
              variant="ghost"
              disabled={removing}
              onClick={() => void remove()}
              className="h-7 px-2 text-xs text-red"
            >
              {removing ? "Removing" : "Confirm"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setConfirmRemove(false)}
              className="h-7 px-2 text-xs"
            >
              Keep
            </Button>
          </span>
        ) : (
          <Button
            variant="ghost"
            onClick={() => setConfirmRemove(true)}
            className="h-7 px-2 text-xs text-red"
          >
            Remove
          </Button>
        )}
      </div>

      <nav
        aria-label="Data source sections"
        className="flex shrink-0 items-center gap-1 border-b border-border px-3"
      >
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-current={tab === entry.id}
            className={
              tab === entry.id
                ? "flex items-center gap-1.5 border-b-2 border-cyan px-2.5 py-2 text-xs font-medium text-fg"
                : "flex items-center gap-1.5 border-b-2 border-transparent px-2.5 py-2 text-xs text-muted-foreground transition-colors hover:text-fg"
            }
          >
            <entry.icon size={14} />
            {entry.label}
          </button>
        ))}
      </nav>

      {}
      {problem !== null ? (
        <div className="flex flex-1 items-start p-4">
          <Alert>{problem}</Alert>
        </div>
      ) : !loaded || schema === null ? (
        <p className="flex flex-1 items-center justify-center font-mono text-xs text-muted-foreground">
          Reading the structure of {source.database ?? source.name}…
        </p>
      ) : schema.tables.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title="No tables"
            body="That database reported no tables in its public schema."
          />
        </div>
      ) : (
        <ResizablePanelGroup className="min-h-0 flex-1 overflow-hidden">
          <ResizablePanel defaultSize="22%" minSize="12%">
            <SchemaTree
              key={source.id}
              tables={schema.tables}
              relationships={schema.relationships}
              selected={selectedTable}
              onSelect={setSelectedTable}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          {tab === "query" ? (
            <>
              <ResizablePanel defaultSize="50%" minSize="25%">
                <QueryRunner
                  key={source.id}
                  sourceId={source.id}
                  focusTable={selectedTable}
                  runRequest={runRequest}
                  onRan={() => setQueriesToken((count) => count + 1)}
                  onSqlChange={setEditorSql}
                  initialSql={
                    schema.tables[0]
                      ? `SELECT * FROM "${schema.tables[0].name}" LIMIT 100;`
                      : ""
                  }
                />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize="28%" minSize="12%">
                <SavedQueriesPanel
                  sourceId={source.id}
                  activeSql={editorSql}
                  reloadToken={queriesToken}
                  onLoad={(sql) => setRunRequest({ sql, nonce: Date.now() })}
                />
              </ResizablePanel>
            </>
          ) : (
            <ResizablePanel defaultSize="78%" minSize="25%">
              <ErdCanvas
                tables={schema.tables}
                relationships={schema.relationships}
                selected={selectedTable}
                onSelect={setSelectedTable}
              />
            </ResizablePanel>
          )}
        </ResizablePanelGroup>
      )}

      {loaded && schema !== null ? (
        <div className="flex shrink-0 items-center gap-4 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
          <span>Read-only</span>
          <span>Structure read from the database catalogue</span>
          <span className="ml-auto tabular-nums">
            Read {new Date(schema.introspectedAt).toLocaleTimeString()}
          </span>
        </div>
      ) : null}
    </div>
  );
}
