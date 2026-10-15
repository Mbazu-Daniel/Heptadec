import { useEffect, useState, type ReactNode } from "react";
import { IconLayoutGrid, IconTerminal } from "@tabler/icons-react";
import type { IDataSource } from "@heptadec/api/data-source-contracts";
import type { ISchemaResponse } from "@heptadec/api/schema-contracts";
import { fetchSchema, messageFor } from "../../api";
import { quoteIdentifier } from "../../lib/sql";
import { Alert, EmptyState } from "../ui/feedback";
import { Button } from "../ui/button";
import { SchemaTree } from "./SchemaTree";
import { ErdCanvas } from "./ErdCanvas";
import { QueryRunner } from "./QueryRunner";
import { PipelineRunner } from "./PipelineRunner";
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
  onTrail,
  onBack,
  onRemove,
  onBrowseRows,
}: {
  source: IDataSource;
  onTrail?: (crumbs: ICrumb[]) => void;
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
  // A source reports the language it is asked in, and what follows from that is
  // decided per language rather than per engine. "No SQL dialect" is not the
  // same question: a Redis source has no dialect either, but it is asked for a
  // command rather than a pipeline.
  const pipelineSource = source.queryLanguage === "pipeline";

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
    // The source is left out: the sidebar already says which one is open, and
    // the breadcrumb is for getting back out, not for repeating the context.
    onTrail?.([{ label: current?.label ?? tab }]);
  }, [onTrail, tab]);

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
        <div className="ml-auto flex items-center gap-2">
          {confirmRemove ? (
            <>
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
            </>
          ) : (
            <>
              <Button
                onClick={() => setBrowsingRows(true)}
                className="h-7 px-3 text-xs"
              >
                Browse rows
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirmRemove(true)}
                className="h-7 px-3 text-xs text-red"
              >
                Remove
              </Button>
            </>
          )}
        </div>
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
            body="That database reported no tables to read."
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
                {/* Only a SQL or a pipeline source reaches this browser, so no dialect
                    here means a pipeline source and there is nothing to guess:
                    the editor is told which dialect rather than left to assume
                    Postgres. */}
                {source.sqlDialect === null ? (
                  <PipelineRunner
                    key={source.id}
                    source={source}
                    tables={schema.tables}
                    focusTable={selectedTable}
                  />
                ) : (
                  <QueryRunner
                    key={source.id}
                    source={source}
                    dialect={source.sqlDialect}
                    focusTable={selectedTable}
                    runRequest={runRequest}
                    onRan={() => setQueriesToken((count) => count + 1)}
                    onSqlChange={setEditorSql}
                    initialSql={
                      schema.tables[0]
                        ? `SELECT * FROM ${quoteIdentifier(source.sqlDialect, schema.tables[0].name)} LIMIT 100;`
                        : ""
                    }
                  />
                )}
              </ResizablePanel>
              {pipelineSource ? null : (
                <>
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
              )}
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
        <div className="flex shrink-0 items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span>Read-only</span>
          <span>
            {pipelineSource
              ? "Structure inferred from sampled documents"
              : "Structure read from the database catalogue"}
          </span>
          <span className="ml-auto tabular-nums">
            Read {new Date(schema.introspectedAt).toLocaleTimeString()}
          </span>
        </div>
      ) : null}
    </div>
  );
}
