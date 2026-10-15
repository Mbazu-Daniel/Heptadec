import { useEffect, useRef, useState } from "react";
import {
  IconCaretDownFilled,
  IconCaretUpFilled,
  IconPlayerPlay,
  IconRobot,
  IconStack,
} from "@tabler/icons-react";
import type { IQueryResponse } from "@heptadec/api/query-contracts";
import type { IExplainNode } from "@heptadec/api/query-contracts";
import type {
  IDataSource,
  SqlDialect,
} from "@heptadec/api/data-source-contracts";
import {
  askQuestion,
  explainQuery,
  messageFor,
  recordRun,
  runQuery,
} from "../../api";
import { exportCsv, exportJson } from "../../lib/export";
import { castToText, quoteIdentifier } from "../../lib/sql";
import { Alert, EmptyState } from "../ui/feedback";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { CellValue } from "../SourceDetail";
import { ExplainTree } from "./ExplainTree";
import {
  TABLE_CELL_CLASSNAME,
  TABLE_CLASSNAME,
  TABLE_ROW_CLASSNAME,
  TOOLBAR_SELECT_CLASSNAME,
} from "../workspace";

const FILTER_OPS = [
  { id: "=", label: "equals" },
  { id: "<>", label: "not equals" },
  { id: ">", label: "greater than" },
  { id: ">=", label: "greater or equal" },
  { id: "<", label: "less than" },
  { id: "<=", label: "less or equal" },
  { id: "contains", label: "contains" },
  { id: "is null", label: "is null" },
  { id: "is not null", label: "is not null" },
] as const;

type FilterOp = (typeof FILTER_OPS)[number]["id"];

interface IRefineFilter {
  column: string;
  op: FilterOp;
  value: string;
}

interface IRefineSort {
  column: string;
  dir: "asc" | "desc";
}

function needsValue(op: FilterOp): boolean {
  return op !== "is null" && op !== "is not null";
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function composeStatement(
  base: string,
  filter: IRefineFilter | null,
  sort: IRefineSort | null,
  dialect: SqlDialect,
): string {
  if (filter === null && sort === null) {
    return base;
  }
  const inner = base.replace(/;+\s*$/, "").trim();
  let statement = `SELECT * FROM (${inner}) AS heptadec_filtered`;
  if (filter !== null) {
    const column = quoteIdentifier(dialect, filter.column);
    if (filter.op === "is null" || filter.op === "is not null") {
      statement += ` WHERE ${column} ${filter.op === "is null" ? "IS NULL" : "IS NOT NULL"}`;
    } else if (filter.op === "contains") {
      statement += ` WHERE ${castToText(dialect, column)} LIKE ${quoteLiteral(`%${filter.value}%`)}`;
    } else {
      statement += ` WHERE ${column} ${filter.op} ${quoteLiteral(filter.value)}`;
    }
  }
  if (sort !== null) {
    statement += ` ORDER BY ${quoteIdentifier(dialect, sort.column)} ${sort.dir === "asc" ? "ASC" : "DESC"}`;
  }
  return `${statement} LIMIT 100`;
}

export function QueryRunner({
  source,
  dialect,
  initialSql,
  focusTable,
  runRequest,
  onRan,
  onSqlChange,
}: {
  source: IDataSource;
  /** Taken from the source rather than defaulted here: an engine with no
   * dialect is not one this editor is for, and guessing "postgres" would
   * build statements in a language the engine does not speak. */
  dialect: SqlDialect;
  initialSql: string;
  focusTable: string | null;
  runRequest: { sql: string; nonce: number } | null;
  onRan: () => void;
  onSqlChange: (sql: string) => void;
}) {
  const sourceId = source.id;
  const [sql, setSql] = useState(initialSql);
  const [result, setResult] = useState<IQueryResponse | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [plan, setPlan] = useState<IExplainNode | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [filterColumn, setFilterColumn] = useState("");
  const [filterOp, setFilterOp] = useState<FilterOp>("=");
  const [filterValue, setFilterValue] = useState("");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [drafted, setDrafted] = useState(false);
  const latestRun = useRef(0);

  async function ask(): Promise<void> {
    if (question.trim() === "") {
      return;
    }
    setAsking(true);
    setProblem(null);
    setDrafted(false);
    let draft = "";
    try {
      const answer = await askQuestion([sourceId], question.trim(), undefined, {
        onDelta: (text) => {
          draft += text;
          setSql(draft);
        },
      });
      if (answer.sql === null) {
        setProblem("That question could not be answered from this schema.");
        return;
      }
      setSql(answer.sql);
      setDrafted(true);
    } catch (caught) {
      setProblem(messageFor(caught, "That question could not be asked."));
    } finally {
      setAsking(false);
    }
  }

  function addToQuery(): void {
    setDrafted(false);
    void execute(sql, true);
  }

  useEffect(() => {
    if (runRequest === null) {
      return;
    }
    setSql(runRequest.sql);
    void execute(runRequest.sql, true);
  }, [runRequest?.nonce]);
  useEffect(() => {
    onSqlChange(sql);
  }, [sql, onSqlChange]);

  function activeFilter(): IRefineFilter | null {
    if (
      filterColumn === "" ||
      (needsValue(filterOp) && filterValue === "")
    ) {
      return null;
    }
    return { column: filterColumn, op: filterOp, value: filterValue };
  }

  function activeSort(): IRefineSort | null {
    return sortColumn === null ? null : { column: sortColumn, dir: sortDir };
  }

  async function execute(statement: string, resetRefine: boolean): Promise<void> {
    const ticket = ++latestRun.current;
    setRunning(true);
    setProblem(null);
    try {
      const answer = await runQuery(sourceId, statement);
      if (ticket !== latestRun.current) {
        return;
      }
      setResult(answer);
      setPlan(null);
      void recordRun(sourceId, statement).then(onRan, () => undefined);
      if (resetRefine) {
        setFilterColumn(answer.columns[0] ?? "");
        setFilterOp("=");
        setFilterValue("");
        setSortColumn(null);
        setSortDir("asc");
      }
    } catch (caught) {
      if (ticket !== latestRun.current) {
        return;
      }
      setResult(null);
      setProblem(messageFor(caught, "That statement could not run."));
    } finally {
      if (ticket === latestRun.current) {
        setRunning(false);
      }
    }
  }
  async function explain(): Promise<void> {
    setExplaining(true);
    setProblem(null);
    try {
      const answer = await explainQuery(sourceId, sql);
      setPlan(answer.plan);
    } catch (caught) {
      setPlan(null);
      setProblem(messageFor(caught, "That statement could not be explained."));
    } finally {
      setExplaining(false);
    }
  }
  function refine(sort: IRefineSort | null): void {
    void execute(composeStatement(sql, activeFilter(), sort, dialect), false);
  }

  function toggleSort(column: string): void {
    const next: IRefineSort | null =
      sortColumn !== column
        ? { column, dir: "asc" }
        : sortDir === "asc"
          ? { column, dir: "desc" }
          : null;
    setSortColumn(next?.column ?? null);
    setSortDir(next?.dir ?? "asc");
    refine(next);
  }

  function clearRefine(): void {
    setFilterColumn(result?.columns[0] ?? "");
    setFilterOp("=");
    setFilterValue("");
    setSortColumn(null);
    setSortDir("asc");
    void execute(sql, false);
  }

  useEffect(() => {
    if (focusTable === null) {
      return;
    }
    const statement = `SELECT * FROM "${focusTable}" LIMIT 100;`;
    setSql(statement);
    void execute(statement, true);
  }, [focusTable]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-border p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <label
            htmlFor="query-sql"
            className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground"
          >
            SQL
          </label>
          {result !== null ? (
            <span className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
              {result.rowCount} row{result.rowCount === 1 ? "" : "s"} ·{" "}
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
              onClick={() => void execute(sql, true)}
              disabled={running || sql.trim().length === 0}
              className="h-8 gap-1.5 px-4 text-xs"
            >
              <IconPlayerPlay size={14} />
              {running ? "Running…" : "Run query"}
            </Button>
            {source.canExplain ? (
              <Button
                variant="ghost"
                onClick={() => void explain()}
                disabled={explaining || running || sql.trim().length === 0}
                className="h-8 gap-1.5 text-xs"
                title="Show the execution plan without running the statement"
              >
                <IconStack size={14} />
                {explaining ? "Explaining…" : "Explain"}
              </Button>
            ) : null}
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
            title="Draft a statement from this question"
          >
            <IconRobot size={14} strokeWidth={1.5} />
            {asking ? "Asking…" : "Ask"}
          </Button>
        </form>
        <textarea
          id="query-sql"
          value={sql}
          onChange={(event) => setSql(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void execute(sql, true);
            }
          }}
          spellCheck={false}
          rows={6}
          placeholder='SELECT * FROM "orders" LIMIT 100;'
          aria-label="SQL statement"
          className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring/50"
        />
        <p className="mt-1.5 font-mono text-[11px] text-muted-foreground">
          ⌘/Ctrl + Enter runs it · clicking a table loads its full contents
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {result !== null && plan === null ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
            <select
              value={filterColumn}
              onChange={(event) => setFilterColumn(event.target.value)}
              aria-label="Filter column"
              className={TOOLBAR_SELECT_CLASSNAME}
            >
              {result.columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
            <select
              value={filterOp}
              onChange={(event) =>
                setFilterOp(event.target.value as FilterOp)
              }
              aria-label="Filter operator"
              className={TOOLBAR_SELECT_CLASSNAME}
            >
              {FILTER_OPS.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.label}
                </option>
              ))}
            </select>
            {needsValue(filterOp) ? (
              <Input
                value={filterValue}
                onChange={(event) => setFilterValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    refine(activeSort());
                  }
                }}
                placeholder="Enter value"
                aria-label="Filter value"
                className="h-7 w-44 px-2 font-mono text-xs"
              />
            ) : null}
            <Button
              variant="ghost"
              onClick={() => refine(activeSort())}
              disabled={
                running ||
                filterColumn === "" ||
                (needsValue(filterOp) && filterValue === "")
              }
              className="h-7 px-2.5 text-xs"
              title="Filter the results"
            >
              Apply
            </Button>
            {activeFilter() !== null || activeSort() !== null ? (
              <Button
                variant="ghost"
                onClick={clearRefine}
                disabled={running}
                className="h-7 px-2.5 text-xs text-muted-foreground"
                title="Drop the filter and the sort"
              >
                Clear
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-auto p-3">
        {problem !== null ? <Alert>{problem}</Alert> : null}
        {drafted ? (
          <div className="flex items-center gap-2">
            <Alert tone="success">
              A statement is ready. It runs only when you add it.
            </Alert>
            <Button
              onClick={addToQuery}
              disabled={running || asking || sql.trim().length === 0}
              className="h-7 shrink-0 gap-1.5 text-xs"
            >
              <IconRobot size={14} strokeWidth={1.5} />
              Add to query
            </Button>
          </div>
        ) : null}
        {plan !== null ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Execution plan
              </span>
              <Button
                variant="ghost"
                onClick={() => setPlan(null)}
                className="ml-auto h-6 px-2 text-[11px] text-muted-foreground hover:text-fg"
              >
                Back to results
              </Button>
            </div>
            <ExplainTree plan={plan} />
          </div>
        ) : result === null ? (
          problem === null ? (
            <EmptyState
              title="No results yet"
              body="Write a statement and run it against this source."
            />
          ) : null
        ) : result.rows.length === 0 ? (
          <EmptyState
            title="No rows"
            body="That statement ran fine but returned nothing."
          />
        ) : (
          <table className={TABLE_CLASSNAME} aria-label="Query results">
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
                    <button
                      type="button"
                      disabled={running}
                      onClick={() => toggleSort(column)}
                      title={`Sort by ${column}`}
                      className="flex min-w-0 cursor-pointer items-baseline gap-1.5 disabled:cursor-default"
                    >
                      <span className="truncate text-xs font-semibold text-fg">
                        {column}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {result.columnTypes[position]}
                      </span>
                      {sortColumn === column ? (
                        sortDir === "asc" ? (
                          <IconCaretUpFilled
                            size={10}
                            className="shrink-0 self-center text-cyan"
                          />
                        ) : (
                          <IconCaretDownFilled
                            size={10}
                            className="shrink-0 self-center text-cyan"
                          />
                        )
                      ) : null}
                    </button>
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
    </div>
  );
}
