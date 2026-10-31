import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  ChartType,
  ICreateWidgetRequest,
  IDashboardSource,
  IWidget,
} from "@heptadec/api/dashboard-contracts";
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
  const savedQueries = useQuery({
    queryKey: ["saved-queries-all"],
    queryFn: listAllSavedQueries,
  });
  const [sourceFilter, setSourceFilter] = useState("");
  const [savedQueryId, setSavedQueryId] = useState(widget?.savedQueryId ?? "");
  const [chartType, setChartType] = useState<ChartType>(widget?.chartType ?? "bar");
  const [title, setTitle] = useState(widget?.title ?? "");
  const [labelColumn, setLabelColumn] = useState(widget?.labelColumn ?? "");
  const [valueColumn, setValueColumn] = useState(widget?.valueColumn ?? "");

  const visible = useMemo(() => {
    const connected = sources.map((source) => source.dataSourceId);
    const scoped = (savedQueries.data?.savedQueries ?? []).filter((entry) =>
      connected.includes(entry.dataSourceId),
    );
    return sourceFilter === ""
      ? scoped
      : scoped.filter((entry) => entry.dataSourceId === sourceFilter);
  }, [savedQueries.data, sources, sourceFilter]);

  const chosen = visible.find((entry) => entry.id === savedQueryId);
  const columns = useQuery({
    queryKey: ["widget-columns", chosen?.id ?? ""],
    queryFn: () => runQuery(chosen!.dataSourceId, chosen!.sql),
    enabled: chosen !== undefined,
  });
  const columnList = columns.data?.columns ?? (columns.isError ? [] : null);

  const save = useMutation({
    mutationFn: async () =>
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
          ).widget,
    onSuccess: onSaved,
  });

  const problem = savedQueries.isError
    ? messageFor(savedQueries.error, "Saved queries could not be read.")
    : columns.isError
      ? messageFor(columns.error, "That query could not run.")
      : save.isError
        ? messageFor(save.error, "That chart could not be saved.")
        : null;

  function pickQuery(id: string): void {
    setSavedQueryId(id);
    setLabelColumn("");
    setValueColumn("");
    if (widget === null && title.trim().length === 0) {
      setTitle(visible.find((entry) => entry.id === id)?.name ?? "");
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

          {columnList === null ? (
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
                  {columnList.map((column) => (
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
                  {columnList.map((column) => (
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
          <Button onClick={() => save.mutate()} disabled={save.isPending || !ready}>
            {save.isPending ? "Saving…" : widget === null ? "Add chart" : "Save chart"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
