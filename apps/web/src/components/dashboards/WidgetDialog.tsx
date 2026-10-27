import { useEffect, useMemo, useState } from "react";
import type {
  ChartType,
  ICreateWidgetRequest,
  IDashboardSource,
  IWidget,
} from "@heptadec/api/dashboard-contracts";
import type { ISavedQuery } from "@heptadec/api/saved-query-contracts";
import {
  createWidget,
  listAllSavedQueries,
  messageFor,
  runQuery,
  updateWidget,
} from "../../api";
import { Alert } from "../ui/feedback";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { SMALL_BUTTON_CLASSNAME, TOOLBAR_SELECT_CLASSNAME } from "../workspace";

const CHART_TYPES: Array<{ id: ChartType; label: string }> = [
  { id: "bar", label: "Bar" },
  { id: "line", label: "Line" },
  { id: "pie", label: "Pie" },
];

const MAX_TITLE = 120;

export function WidgetDialog({
  dashboardId,
  sources,
  widget,
  onClose,
  onSaved,
}: {
  dashboardId: string;
  sources: IDashboardSource[];
  widget: IWidget | null;
  onClose: () => void;
  onSaved: (saved: IWidget) => void;
}) {
  const [queries, setQueries] = useState<ISavedQuery[] | null>(null);
  const [sourceFilter, setSourceFilter] = useState("");
  const [savedQueryId, setSavedQueryId] = useState(widget?.savedQueryId ?? "");
  const [chartType, setChartType] = useState<ChartType>(widget?.chartType ?? "bar");
  const [title, setTitle] = useState(widget?.title ?? "");
  const [labelColumn, setLabelColumn] = useState(widget?.labelColumn ?? "");
  const [valueColumn, setValueColumn] = useState(widget?.valueColumn ?? "");
  const [columns, setColumns] = useState<string[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const visible = useMemo(() => {
    const connected = sources.map((source) => source.dataSourceId);
    const scoped = (queries ?? []).filter((entry) =>
      connected.includes(entry.dataSourceId),
    );
    return sourceFilter === ""
      ? scoped
      : scoped.filter((entry) => entry.dataSourceId === sourceFilter);
  }, [queries, sources, sourceFilter]);

  useEffect(() => {
    let live = true;
    listAllSavedQueries().then(
      (found) => {
        if (live) {
          setQueries(found.savedQueries);
        }
      },
      (caught: unknown) => {
        if (live) {
          setProblem(messageFor(caught, "Saved queries could not be read."));
        }
      },
    );
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    const query = visible.find((entry) => entry.id === savedQueryId);
    if (query === undefined) {
      return;
    }
    let live = true;
    setColumns(null);
    runQuery(query.dataSourceId, query.sql).then(
      (result) => {
        if (live) {
          setColumns(result.columns);
        }
      },
      (caught: unknown) => {
        if (live) {
          setColumns([]);
          setProblem(messageFor(caught, "That query could not run."));
        }
      },
    );
    return () => {
      live = false;
    };
  }, [visible, savedQueryId]);

  function pickQuery(id: string): void {
    setSavedQueryId(id);
    if (widget === null && title.trim().length === 0) {
      setTitle(visible.find((entry) => entry.id === id)?.name ?? "");
    }
  }

  async function save(): Promise<void> {
    setSaving(true);
    setProblem(null);
    try {
      const saved =
        widget === null
          ? (
              await createWidget(dashboardId, {
                savedQueryId,
                chartType,
                title,
                labelColumn,
                valueColumn,
              } satisfies ICreateWidgetRequest)
            ).widget
          : (
              await updateWidget(widget.id, {
                chartType,
                title,
                labelColumn,
                valueColumn,
              })
            ).widget;
      onSaved(saved);
    } catch (caught) {
      setProblem(messageFor(caught, "That chart could not be saved."));
    } finally {
      setSaving(false);
    }
  }

  const ready =
    savedQueryId !== "" &&
    title.trim().length > 0 &&
    labelColumn !== "" &&
    valueColumn !== "";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{widget === null ? "Add a chart" : "Edit chart"}</DialogTitle>
        </DialogHeader>

        {problem !== null ? <Alert>{problem}</Alert> : null}

        <div className="grid gap-3 text-xs">
          {sources.length > 1 ? (
            <label className="grid gap-1.5">
              <span className="text-muted-foreground">Data source</span>
              <select
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value)}
                className={TOOLBAR_SELECT_CLASSNAME}
              >
                <option value="">Every connected source</option>
                {sources.map((source) => (
                  <option
                    key={source.dataSourceId}
                    value={source.dataSourceId}
                  >
                    {source.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="grid gap-1.5">
            <span className="text-muted-foreground">Saved query</span>
            <select
              value={savedQueryId}
              onChange={(event) => pickQuery(event.target.value)}
              disabled={widget !== null}
              className={TOOLBAR_SELECT_CLASSNAME}
            >
              {widget !== null ? null : <option value="">Pick a query…</option>}
              {visible.map((query) => (
                <option key={query.id} value={query.id}>
                  {query.name}
                </option>
              ))}
            </select>
            {visible.length === 0 && (
              <p className="text-[11px] text-muted-foreground">
                Write one under Data Sources, or ask the AI.
              </p>
            )}
          </label>

          {columns === null ? (
            savedQueryId === "" ? null : (
              <p className="font-mono text-[11px] text-muted-foreground">
                Reading the query's columns…
              </p>
            )
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5">
                <span className="text-muted-foreground">Label by</span>
                <select
                  value={labelColumn}
                  onChange={(event) => setLabelColumn(event.target.value)}
                  className={TOOLBAR_SELECT_CLASSNAME}
                >
                  <option value="">Pick a column…</option>
                  {columns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-muted-foreground">Plot</span>
                <select
                  value={valueColumn}
                  onChange={(event) => setValueColumn(event.target.value)}
                  className={TOOLBAR_SELECT_CLASSNAME}
                >
                  <option value="">Pick a column…</option>
                  {columns.map((column) => (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          <label className="grid gap-1.5">
            <span className="text-muted-foreground">Title</span>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={MAX_TITLE}
              className="h-8 px-2 text-xs"
            />
          </label>

          <div className="grid gap-1.5">
            <span className="text-muted-foreground">Chart</span>
            <div className="flex gap-1" role="group" aria-label="Chart type">
              {CHART_TYPES.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setChartType(entry.id)}
                  aria-current={chartType === entry.id}
                  className={
                    chartType === entry.id
                      ? "rounded-md border border-cyan/40 bg-cyan/10 px-3 py-1.5 text-xs font-medium text-fg"
                      : "rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-fg"
                  }
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className={SMALL_BUTTON_CLASSNAME}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving || !ready}
          >
            {saving ? "Saving…" : widget === null ? "Add chart" : "Save chart"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
