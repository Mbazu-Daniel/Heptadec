import { useEffect, useState, type FormEvent } from "react";
import type {
  IDataSource,
  IPreviewObject,
  IPreviewResponse,
} from "@heptadec/api/data-source-contracts";
import type { IResultGrid, IRedisQueryResponse } from "@heptadec/api/query-contracts";
import {
  deleteDataSource,
  listSourceObjects,
  messageFor,
  previewSourceRows,
  runRedisCommand,
} from "../api";
import { Alert, EmptyState } from "./ui/feedback";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  SMALL_BUTTON_CLASSNAME,
  TABLE_CELL_CLASSNAME,
  TABLE_CLASSNAME,
  TABLE_HEAD_CLASSNAME,
  TABLE_ROW_CLASSNAME,
} from "./workspace";

interface ISourceDetailProps {
  source: IDataSource;
  onBack: () => void;
  onRemoved: () => void;
}

export function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="italic text-muted-foreground">(NULL)</span>;
  }
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (
    <span
      title={text.length > 160 ? text : undefined}
      className="block max-w-[320px] truncate"
    >
      {text}
    </span>
  );
}

function ResultGrid({ grid, label }: { grid: IResultGrid; label: string }) {
  return (
    <div className="overflow-auto">
      <table className={TABLE_CLASSNAME} aria-label={label}>
        <thead>
          <tr>
            {grid.columns.map((column) => (
              <th key={column} scope="col" className={TABLE_HEAD_CLASSNAME}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row, index) => (
            <tr key={index} className={TABLE_ROW_CLASSNAME}>
              {grid.columns.map((column) => (
                <td
                  key={column}
                  className={`${TABLE_CELL_CLASSNAME} font-mono text-xs`}
                >
                  <CellValue value={row[column]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SourceDetail({ source, onBack, onRemoved }: ISourceDetailProps) {
  const [objects, setObjects] = useState<IPreviewObject[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<IPreviewResponse | null>(null);
  const [objectsError, setObjectsError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [search, setSearch] = useState("*");
  const [appliedSearch, setAppliedSearch] = useState("*");
  const [command, setCommand] = useState("");
  const [commandResult, setCommandResult] = useState<IRedisQueryResponse | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [commandBusy, setCommandBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setObjects(null);
    setSelected(null);
    setPreview(null);
    setObjectsError(null);
    listSourceObjects(source.id)
      .then((result) => {
        if (!live) {
          return;
        }
        setObjects(result.objects);
        setSelected(result.objects[0]?.name ?? null);
      })
      .catch((caught: unknown) => {
        if (live) {
          setObjectsError(messageFor(caught, "Objects could not load."));
        }
      });
    return () => {
      live = false;
    };
  }, [source.id]);

  useEffect(() => {
    if (selected === null) {
      setPreview(null);
      return;
    }
    let live = true;
    setPreviewBusy(true);
    setPreviewError(null);
    previewSourceRows(
      source.id,
      selected,
      source.kind === "quickwit" ? appliedSearch : undefined,
    )
      .then((result) => {
        if (live) {
          setPreview(result);
        }
      })
      .catch((caught: unknown) => {
        if (live) {
          setPreviewError(messageFor(caught, "Rows could not load."));
        }
      })
      .finally(() => {
        if (live) {
          setPreviewBusy(false);
        }
      });
    return () => {
      live = false;
    };
  }, [source.id, selected, appliedSearch, source.kind]);

  function runSearch(event: FormEvent): void {
    event.preventDefault();
    setAppliedSearch(search.trim().length === 0 ? "*" : search.trim());
  }
  async function runCommand(event: FormEvent): Promise<void> {
    event.preventDefault();
    const text = command.trim();
    if (text.length === 0) {
      return;
    }
    setCommandBusy(true);
    setCommandError(null);
    try {
      setCommandResult(await runRedisCommand(source.id, text));
    } catch (caught) {
      setCommandResult(null);
      setCommandError(messageFor(caught, "That command could not run."));
    } finally {
      setCommandBusy(false);
    }
  }

  async function remove(): Promise<void> {
    setRemoving(true);
    setRemoveError(null);
    try {
      await deleteDataSource(source.id);
      onRemoved();
    } catch (caught) {
      setRemoveError(messageFor(caught, "The source was not removed."));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          variant="ghost"
          onClick={onBack}
          className={SMALL_BUTTON_CLASSNAME}
        >
          <span className="material-symbols-outlined text-[16px]">
            arrow_back
          </span>
          Sources
        </Button>
      </div>

      {objectsError ? <Alert>{objectsError}</Alert> : null}

      {source.kind === "redis" ? (
        <form onSubmit={runCommand} className="border border-border">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Command
            </span>
            {commandResult !== null ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                {commandResult.rows.length} row
                {commandResult.rows.length === 1 ? "" : "s"} ·{" "}
                {commandResult.durationMs} ms
                {commandResult.truncated ? " · truncated" : ""}
              </span>
            ) : null}
            <Button
              type="submit"
              disabled={commandBusy || command.trim().length === 0}
              className={`ml-auto ${SMALL_BUTTON_CLASSNAME}`}
            >
              {commandBusy ? "Running…" : "Run command"}
            </Button>
          </div>
          <div className="p-4">
            <textarea
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              spellCheck={false}
              rows={2}
              placeholder="HGETALL event:a91f"
              aria-label="Redis command"
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring/50"
            />
            <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
              Read commands only — GET, SCAN, HGETALL, TTL, TYPE. A write is
              refused before it is sent.
            </p>
            {commandError ? (
              <Alert className="mt-3">{commandError}</Alert>
            ) : null}
            {commandResult !== null && commandResult.rows.length > 0 ? (
              <div className="mt-3">
                <ResultGrid grid={commandResult} label="Command results" />
              </div>
            ) : null}
          </div>
        </form>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="border border-border">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Objects
            </span>
            <span className="ml-auto font-mono text-[11px] text-muted-foreground">
              {objects === null ? "—" : objects.length}
            </span>
          </div>
          {objects === null ? (
            <p className="px-4 py-6 font-mono text-xs text-muted-foreground">
              Loading objects…
            </p>
          ) : objects.length === 0 ? (
            <p className="px-4 py-6 text-xs text-muted-foreground">
              No tables, keys, or indexes found.
            </p>
          ) : (
            <ul className="max-h-[480px] divide-y divide-border overflow-auto">
              {objects.map((object) => (
                <li key={object.name}>
                  <button
                    type="button"
                    onClick={() => setSelected(object.name)}
                    aria-current={selected === object.name ? "true" : undefined}
                    className={
                      selected === object.name
                        ? "flex w-full items-center gap-2 border-l-2 border-cyan bg-cyan/10 px-3 py-2 text-left"
                        : "flex w-full items-center gap-2 border-l-2 border-transparent px-3 py-2 text-left transition-colors hover:bg-foreground/5"
                    }
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">
                      {object.name}
                    </span>
                    <span className="font-mono text-[10px] uppercase text-muted-foreground">
                      {object.type}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0 border border-border">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
            <span className="truncate font-mono text-xs text-muted-foreground">
              {selected ?? "No object selected"}
            </span>
            {preview && preview.truncated ? (
              <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                First {preview.rows.length} rows
              </span>
            ) : null}
          </div>
          {source.kind === "quickwit" && selected !== null ? (
            <form
              onSubmit={runSearch}
              className="flex gap-2 border-b border-border px-4 py-2.5"
            >
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search query, e.g. * or status:200"
                aria-label="Search query"
                className="h-8 rounded-none font-mono text-xs"
              />
              <Button
                type="submit"
                disabled={previewBusy}
                className={SMALL_BUTTON_CLASSNAME}
              >
                Search
              </Button>
            </form>
          ) : null}
          <div className="p-4">
            {previewError ? <Alert>{previewError}</Alert> : null}
            {previewBusy && !preview ? (
              <p className="font-mono text-xs text-muted-foreground">
                Loading rows…
              </p>
            ) : preview === null ? (
              <EmptyState
                title="No object selected"
                body="Pick a table, key, or index to preview its rows."
              />
            ) : preview.rows.length === 0 ? (
              <EmptyState
                title="No rows"
                body="This object exists but returned nothing to show."
              />
            ) : (
              <ResultGrid grid={preview} label="Preview rows" />
            )}
          </div>
        </div>
      </div>

      <div className="border border-border px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Danger zone
        </p>
        {removeError ? <Alert className="mt-3">{removeError}</Alert> : null}
        <div className="mt-3 flex items-center gap-2">
          {confirming ? (
            <>
              <span className="text-xs text-muted-foreground">
                Remove this source? Saved credentials go with it.
              </span>
              <Button
                variant="ghost"
                disabled={removing}
                onClick={() => void remove()}
                className={`${SMALL_BUTTON_CLASSNAME} text-red`}
              >
                {removing ? "Removing" : "Yes, remove"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setConfirming(false)}
                className={SMALL_BUTTON_CLASSNAME}
              >
                Keep
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              onClick={() => setConfirming(true)}
              className={`${SMALL_BUTTON_CLASSNAME} text-red`}
            >
              Remove source
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
