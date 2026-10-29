import { useEffect, useState, type ReactNode } from "react";
import { IconLayoutGrid, IconRefresh, IconTerminal } from "@tabler/icons-react";
import type { IDataSource } from "@heptadec/api/data-source-contracts";
import { quoteIdentifier } from "../../lib/sql";
import { useStructure } from "../../lib/use-structure";
import { Alert, EmptyState } from "../ui/feedback";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
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
  const { structure, loading, problem, refreshing, refresh } = useStructure(
    source.id,
  );
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [browsingRows, setBrowsingRows] = useState(false);
  const [runRequest, setRunRequest] = useState<IRunRequest | null>(null);
  const [queriesToken, setQueriesToken] = useState(0);
  const [editorSql, setEditorSql] = useState("");
  const pipelineSource = source.queryLanguage === "pipeline";
  const shown = loading || structure === null ? null : structure;

  useEffect(() => {
    const current = TABS.find((entry) => entry.id === tab);
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
      ) : shown === null ? (
        <StructureSkeleton name={source.database ?? source.name} />
      ) : shown.tables.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            title={shown.state === "failed" ? "That structure could not be read" : "No tables"}
            body={
              shown.state === "failed"
                ? (shown.error ?? undefined)
                : "That database reported no tables to read."
            }
            action={
              shown.state === "failed" ? (
                <Button onClick={() => void refresh()} disabled={refreshing}>
                  {refreshing ? "Reading" : "Read it again"}
                </Button>
              ) : null
            }
          />
        </div>
      ) : (
        <ResizablePanelGroup className="min-h-0 flex-1 overflow-hidden">
          <ResizablePanel defaultSize="22%" minSize="12%">
            <SchemaTree
              key={source.id}
              tables={shown.tables}
              relationships={shown.relationships}
              selected={selectedTable}
              onSelect={setSelectedTable}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          {tab === "query" ? (
            <>
              <ResizablePanel defaultSize="50%" minSize="25%">
                {source.sqlDialect === null ? (
                  <PipelineRunner
                    key={source.id}
                    source={source}
                    tables={shown.tables}
                    focusTable={selectedTable}
                  />
                ) : (
                  <QueryRunner
                    key={source.id}
                    source={source}
                    focusTable={selectedTable}
                    runRequest={runRequest}
                    onRan={() => setQueriesToken((count) => count + 1)}
                    onSqlChange={setEditorSql}
                    initialSql={
                      shown.tables[0]
                        ? `SELECT * FROM ${quoteIdentifier(source.sqlDialect, shown.tables[0].name)} LIMIT 100;`
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
                tables={shown.tables}
                relationships={shown.relationships}
                selected={selectedTable}
                onSelect={setSelectedTable}
              />
            </ResizablePanel>
          )}
        </ResizablePanelGroup>
      )}

      {shown === null ? null : (
        <div className="flex shrink-0 items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span>Read-only</span>
          <span>
            {pipelineSource
              ? "Structure inferred from sampled documents"
              : "Structure read from the database catalogue"}
          </span>
          {shown.syncing ? (
            <p role="status" className="text-amber-600">
              Reading it again
            </p>
          ) : null}
          <span
            className={`ml-auto tabular-nums ${shown.stale ? "text-amber-600" : ""}`}
          >
            {structureAge(shown.syncedAt, shown.stale)}
          </span>
          <Button
            variant="ghost"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() => void refresh()}
            disabled={refreshing || shown.syncing}
          >
            <IconRefresh size={12} />
            {shown.stale ? "Read again" : "Refresh"}
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * How long ago the app read this structure — said in the unit a user would use,
 * because "14:03" is only honest about age if today is obvious.
 */
function structureAge(syncedAt: string | null, stale: boolean): string {
  if (syncedAt === null) {
    return "Never read";
  }
  const read = new Date(syncedAt);
  const minutes = Math.floor((Date.now() - read.getTime()) / 60_000);
  const age =
    minutes < 1
      ? "just now"
      : minutes < 60
        ? `${minutes} min ago`
        : minutes < 1_440
          ? `${Math.floor(minutes / 60)} h ago`
          : read.toLocaleDateString();
  return stale ? `Out of date · read ${age}` : `Read ${age}`;
}

/**
 * The shape the structure will fill, drawn while the app reads it.
 *
 * A first read happens once per source, in the background, and lands in seconds —
 * so this is a few rows of pulse rather than a spinner that asks the user to wait
 * without saying what for.
 */
function StructureSkeleton({ name }: { name: string }) {
  return (
    <div
      role="status"
      className="flex min-h-0 flex-1 flex-col gap-3 p-4"
      aria-label={`Reading the structure of ${name}`}
    >
      <p className="font-mono text-xs text-muted-foreground">
        Reading the structure of {name}…
      </p>
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex w-1/4 flex-col gap-2">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((row) => (
            <Skeleton key={row} className="h-4" />
          ))}
        </div>
        <Skeleton className="min-h-0 flex-1" />
      </div>
    </div>
  );
}
