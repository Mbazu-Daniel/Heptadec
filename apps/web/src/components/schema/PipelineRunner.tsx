import { useEffect, useState } from "react";
import { IconPlayerPlay, IconRobot } from "@tabler/icons-react";
import type { IDataSource } from "@heptadec/api/data-source-contracts";
import type { IQueryResponse } from "@heptadec/api/query-contracts";
import type { ISchemaTable } from "@heptadec/api/schema-contracts";
import { askQuestion, messageFor, runPipeline } from "../../api";
import { exportCsv, exportJson } from "../../lib/export";
import { EmptyState } from "../ui/feedback";
import { Button } from "../ui/button";
import { CellValue } from "../SourceDetail";
import {
  TABLE_CELL_CLASSNAME,
  TABLE_CLASSNAME,
  TABLE_ROW_CLASSNAME,
  TOOLBAR_SELECT_CLASSNAME,
} from "../workspace";

const DEFAULT_STAGES = '[\n  {\n    "$limit": 100\n  }\n]';

export function PipelineRunner({
  source,
  tables,
  focusTable,
}: {
  source: IDataSource;
  tables: ISchemaTable[];
  focusTable: string | null;
}) {
  const [collection, setCollection] = useState(tables[0]?.name ?? "");
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const [result, setResult] = useState<IQueryResponse | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);

  async function ask(): Promise<void> {
    if (question.trim() === "") {
      return;
    }
    setAsking(true);
    setProblem(null);
    try {
      const answer = await askQuestion([source.id], question.trim(), undefined, {});
      if (answer.pipeline === null) {
        setProblem("That question could not be answered from this schema.");
        return;
      }
      setCollection(answer.pipeline.collection);
      setStages(JSON.stringify(answer.pipeline.pipeline, null, 2));
    } catch (caught) {
      setProblem(messageFor(caught, "That question could not be asked."));
    } finally {
      setAsking(false);
    }
  }

  async function execute(nextCollection: string, text: string): Promise<void> {
    let parsed: Record<string, unknown>[];
    try {
      parsed = parseStages(text);
    } catch {
      setProblem("A pipeline is a list of stages, written as JSON.");
      return;
    }
    setRunning(true);
    setProblem(null);
    try {
      setResult(await runPipeline(source.id, { collection: nextCollection, pipeline: parsed }));
    } catch (caught) {
      setResult(null);
      setProblem(messageFor(caught, "That pipeline could not run."));
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (focusTable === null) {
      return;
    }
    setCollection(focusTable);
    void execute(focusTable, DEFAULT_STAGES);
  }, [focusTable]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label
            htmlFor="query-collection"
            className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
          >
            Collection
          </label>
          <select
            id="query-collection"
            value={collection}
            onChange={(event) => setCollection(event.target.value)}
            className={`${TOOLBAR_SELECT_CLASSNAME} max-w-56`}
          >
            {tables.map((table) => (
              <option key={table.name} value={table.name}>
                {table.name}
              </option>
            ))}
          </select>
          {result !== null ? (
            <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
              {result.rowCount} document{result.rowCount === 1 ? "" : "s"} ·{" "}
              {result.durationMs} ms
              {result.truncated ? " · truncated" : ""}
            </span>
          ) : null}
          {result !== null && result.columns.length > 0 ? (
            <span className="flex shrink-0 items-center gap-1.5">
              <Button
                variant="ghost"
                onClick={() => exportCsv(result, "heptadec-results")}
                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-fg"
                title="Download the current results as CSV"
              >
                Export CSV
              </Button>
              <Button
                variant="ghost"
                onClick={() => exportJson(result, "heptadec-results")}
                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-fg"
                title="Download the current results as JSON"
              >
                Export JSON
              </Button>
            </span>
          ) : null}
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button
              onClick={() => void execute(collection, stages)}
              disabled={running || collection === "" || stages.trim().length === 0}
              className="h-8 gap-1.5 px-4 text-xs"
            >
              <IconPlayerPlay size={14} />
              {running ? "Running…" : "Run pipeline"}
            </Button>
          </span>
        </div>
        <form
          className="mt-2 flex items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void ask();
          }}
        >
          <input
            aria-label="Ask a question about this source"
            value={question}
            placeholder="Ask in words…"
            onChange={(event) => setQuestion(event.target.value)}
            className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2.5 text-xs"
          />
          <Button
            type="submit"
            variant="ghost"
            disabled={asking || question.trim().length === 0}
            className="h-8 shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-fg"
            title="Draft a pipeline from this question"
          >
            <IconRobot size={14} strokeWidth={1.5} />
            {asking ? "Asking…" : "Ask"}
          </Button>
        </form>
        <textarea
          value={stages}
          onChange={(event) => setStages(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void execute(collection, stages);
            }
          }}
          spellCheck={false}
          rows={8}
          placeholder='[\n  {\n    "$match": {\n      "status": "paid"\n    }\n  }\n]'
          aria-label="Aggregation pipeline stages"
          className="mt-2 w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring/50"
        />
        <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
          A JSON list of stages · ⌘/Ctrl + Enter runs it
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
        {problem !== null ? (
          <p className="text-xs text-red-500">{problem}</p>
        ) : result === null ? (
          <EmptyState
            title="No results yet"
            body="Write a pipeline and run it against this collection."
          />
        ) : result.rows.length === 0 ? (
          <EmptyState
            title="No documents"
            body="Ran fine — returned nothing."
          />
        ) : (
          <table className={TABLE_CLASSNAME} aria-label="Pipeline results">
            <thead>
              <tr>
                <th
                  scope="col"
                  aria-label="Row number"
                  className="w-10 px-2 py-1.5"
                />
                {result.columns.map((column, position) => (
                  <th
                    key={column}
                    scope="col"
                    className="max-w-[240px] px-2 py-1.5 text-left align-middle"
                  >
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="truncate text-xs font-semibold text-fg">
                        {column}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {result.columnTypes[position]}
                      </span>
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, index) => (
                <tr key={index} className={TABLE_ROW_CLASSNAME}>
                  <td className="px-2 py-1.5 text-right align-middle font-mono text-[11px] tabular-nums text-muted-foreground">
                    {index + 1}
                  </td>
                  {result.columns.map((column) => (
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
        )}
      </div>
    </div>
  );
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStages(text: string): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("A pipeline is a list of stages.");
  }
  const stages: Record<string, unknown>[] = [];
  for (const stage of parsed) {
    if (!isJsonObject(stage)) {
      throw new Error("A pipeline is a list of stages.");
    }
    stages.push(stage);
  }
  return stages;
}
