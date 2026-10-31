import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  IDataSource,
  IPreviewResponse,
} from "@heptadec/api/data-source-contracts";
import type { IResultGrid, IRedisQueryResponse } from "@heptadec/api/query-contracts";
import {
  askQuestion,
  messageFor,
  previewSourceRows,
  runRedisCommand,
  runSearch,
} from "../api";
import { useStructure } from "../lib/use-structure";
import { dataSourceKeys } from "../lib/queries";
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

export function SourceDetail({ source, onBack }: ISourceDetailProps) {
  const language = source.queryLanguage;
  const speaksSearch = language === "search";
  const speaksCommand = language === "command";
  const speaksSqlOrPipeline = language === "sql" || language === "pipeline";

  const { structure, loading, problem } = useStructure(source.id);
  const objects = structure?.objects ?? null;

  const [picked, setPicked] = useState<string | null>(null);
  const selected = picked ?? objects?.[0]?.name ?? null;
  const [search, setSearch] = useState("*");
  const [appliedSearch, setAppliedSearch] = useState("*");
  const [command, setCommand] = useState("");
  const [question, setQuestion] = useState("");

  const queryClient = useQueryClient();
  const previewQuery = useQuery({
    queryKey: dataSourceKeys.preview(
      source.id,
      selected ?? "",
      speaksSearch ? appliedSearch : "",
    ),
    queryFn: () =>
      speaksSearch
        ? runSearch(source.id, { index: selected ?? "", query: appliedSearch })
        : previewSourceRows(source.id, selected ?? ""),
    enabled: selected !== null,
    staleTime: Infinity,
  });
  const preview: IPreviewResponse | null = previewQuery.data ?? null;

  const runCommand = useMutation({
    mutationFn: (text: string) => runRedisCommand(source.id, text),
  });
  const ask = useMutation({
    mutationFn: (text: string) => askQuestion([source.id], text, undefined, {}),
    onSuccess: (answer) => {
      if (answer.command !== null) {
        setCommand(answer.command);
        return;
      }
      if (answer.search !== null) {
        setPicked(answer.search.index);
        setSearch(answer.search.query);
        setAppliedSearch(answer.search.query);
      }
    },
  });

  function pick(object: string): void {
    setPicked(object);
    queryClient.invalidateQueries({ queryKey: dataSourceKeys.preview(source.id, object) });
  }

  function applySearch(event: FormEvent): void {
    event.preventDefault();
    setAppliedSearch(search.trim().length === 0 ? "*" : search.trim());
  }

  function submitCommand(event: FormEvent): void {
    event.preventDefault();
    const text = command.trim();
    if (text.length > 0) {
      runCommand.mutate(text);
    }
  }

  const answer = ask.data ?? null;
  const drafted =
    answer !== null && (answer.command !== null || answer.search !== null);
  const commandResult: IRedisQueryResponse | null = runCommand.data ?? null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Button
          variant="ghost"
          onClick={onBack}
          className={SMALL_BUTTON_CLASSNAME}
        >
          <span className="material-symbols-outlined text-[17px]">
            arrow_back
          </span>
          Sources
        </Button>
      </div>

      {problem !== null ? <Alert>{problem}</Alert> : null}

      {!speaksSqlOrPipeline ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const text = question.trim();
            if (text.length > 0) {
              ask.mutate(text);
            }
          }}
          className="flex flex-wrap items-center gap-2 border border-border px-4 py-2.5"
        >
          <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Ask AI
          </span>
          <Input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={
              speaksSearch ? "Any errors in the logs?" : "How many keys are in the cache?"
            }
            aria-label="Ask this source a question"
            className="max-w-sm text-xs"
          />
          <Button
            type="submit"
            disabled={ask.isPending || question.trim().length === 0}
            className={SMALL_BUTTON_CLASSNAME}
          >
            {ask.isPending ? "Asking…" : "Ask"}
          </Button>
          {drafted ? (
            <span className="text-[11px] text-green">
              {speaksSearch
                ? "A search is ready. It runs only when you search."
                : "A command is ready. It runs only when you run it."}
            </span>
          ) : null}
          {ask.isError ? (
            <Alert>{messageFor(ask.error, "That question could not be asked.")}</Alert>
          ) : null}
          {answer !== null && answer.command === null && answer.search === null ? (
            <Alert>That question could not be answered from this source.</Alert>
          ) : null}
        </form>
      ) : null}

      {speaksCommand ? (
        <form onSubmit={submitCommand} className="border border-border">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2.5">
            <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Command
            </span>
            {commandResult !== null ? (
              <span className="font-mono text-[12px] text-muted-foreground">
                {commandResult.rows.length} row
                {commandResult.rows.length === 1 ? "" : "s"} ·{" "}
                {commandResult.durationMs} ms
                {commandResult.truncated ? " · truncated" : ""}
              </span>
            ) : null}
            <Button
              type="submit"
              disabled={runCommand.isPending || command.trim().length === 0}
              className={`ml-auto ${SMALL_BUTTON_CLASSNAME}`}
            >
              {runCommand.isPending ? "Running…" : "Run command"}
            </Button>
            <span className="text-[11px] font-normal text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                preview
              </span>
            </span>
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
            <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
              Read commands only — writes are refused.
            </p>
            {drafted ? (
              <Alert tone="success" className="mt-3">
                A command is ready. It runs only when you run it.
              </Alert>
            ) : null}
            {runCommand.isError ? (
              <Alert className="mt-3">
                {messageFor(runCommand.error, "That command could not run.")}
              </Alert>
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
            <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Objects
            </span>
            <span className="ml-auto font-mono text-[12px] text-muted-foreground">
              {objects === null ? "—" : objects.length}
            </span>
          </div>
          {loading || objects === null ? (
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
                    onClick={() => pick(object.name)}
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
                    <span className="font-mono text-[11px] uppercase text-muted-foreground">
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
              <span className="ml-auto font-mono text-[12px] text-muted-foreground">
                First {preview.rows.length} rows
              </span>
            ) : null}
          </div>
          {speaksSearch && selected !== null ? (
            <form
              onSubmit={applySearch}
              className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5"
            >
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search query, e.g. * or status:200"
                aria-label="Search query"
                className="h-8 rounded-none font-mono text-xs flex-1"
              />
              <Button
                type="submit"
                disabled={previewQuery.isPending}
                className={SMALL_BUTTON_CLASSNAME}
              >
                Search
              </Button>
              <span className="text-[11px] font-normal text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  preview
                </span>
              </span>
            </form>
          ) : null}
          <div className="p-4">
            {previewQuery.isError ? (
              <Alert>{messageFor(previewQuery.error, "Rows could not load.")}</Alert>
            ) : null}
            {selected === null ? (
              <EmptyState
                title="No object selected"
                body="Pick a table, key, or index to preview its rows."
              />
            ) : previewQuery.isPending ? (
              <p className="font-mono text-xs text-muted-foreground">
                Loading rows…
              </p>
            ) : preview === null || preview.rows.length === 0 ? (
              <EmptyState
                title="No rows"
                body="Nothing to show."
              />
            ) : (
              <ResultGrid grid={preview} label="Preview rows" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
