import { useEffect, useState } from "react";
import {
  IconPencil,
  IconPlayerPlay,
  IconRefresh,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import type {
  IDashboardSource,
  IDashboardWithWidgets,
  IWidget,
  IWidgetData,
} from "@heptadec/api/dashboard-contracts";
import {
  deleteDashboard,
  deleteWidget,
  fetchDashboard,
  fetchWidgetData,
  messageFor,
  refreshWidgetData,
} from "../../api";
import { Alert, EmptyState } from "../ui/feedback";
import { Button } from "../ui/button";
import { VIEW_CLASSNAME } from "../workspace";
import { WidgetCard } from "./WidgetCard";
import { WidgetDialog } from "./WidgetDialog";
import { ShareDialog } from "./ShareDialog";
import { AskAiPanel } from "./AskAiPanel";

const emptySources: IDashboardSource[] = [];

export function DashboardDetail({
  dashboardId,
  onBack,
}: {
  dashboardId: string;
  onBack: () => void;
}) {
  const [dashboard, setDashboard] = useState<IDashboardWithWidgets | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<IWidget | null>(null);
  const [sharing, setSharing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    let live = true;
    fetchDashboard(dashboardId).then(
      (found) => {
        if (live) {
          setDashboard(found.dashboard);
        }
      },
      (caught: unknown) => {
        if (live) {
          setProblem(messageFor(caught, "That dashboard could not be read."));
        }
      },
    );
    return () => {
      live = false;
    };
  }, [dashboardId]);

  function saved(saved: IWidget): void {
    setDashboard((current) =>
      current === null
        ? current
        : {
            ...current,
            widgets: current.widgets.some((entry) => entry.id === saved.id)
              ? current.widgets.map((entry) =>
                  entry.id === saved.id ? saved : entry,
                )
              : [...current.widgets, saved],
          },
    );
    setAdding(false);
    setEditing(null);
  }

  async function remove(widget: IWidget): Promise<void> {
    try {
      await deleteWidget(widget.id);
      setDashboard((current) =>
        current === null
          ? current
          : { ...current, widgets: current.widgets.filter((entry) => entry.id !== widget.id) },
      );
    } catch (caught) {
      setProblem(messageFor(caught, "That chart could not be removed."));
    }
  }

  async function removeDashboard(): Promise<void> {
    try {
      await deleteDashboard(dashboardId);
      onBack();
    } catch (caught) {
      setProblem(messageFor(caught, "That dashboard could not be removed."));
    }
  }

  return (
    <div className={VIEW_CLASSNAME}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        {dashboard !== null && dashboard.sources.length > 0 && (
          <span className="flex items-center gap-1.5">
            {dashboard.sources.map((source) => (
              <span
                key={source.dataSourceId}
                className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground"
                title={`Draws from ${source.name}`}
              >
                {source.name}
              </span>
            ))}
          </span>
        )}
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {dashboard === null ? "" : `${dashboard.widgets.length} charts`}
        </span>
        <Button
          variant="ghost"
          onClick={() => setAsking(true)}
          disabled={dashboard === null}
          className="h-7 gap-1.5 px-2.5 text-xs"
        >
          <IconSparkles size={13} strokeWidth={1.5} />
          Ask AI
        </Button>
        <Button
          onClick={() => setAdding(true)}
          disabled={dashboard === null}
          className="h-7 gap-1.5 px-3 text-xs"
        >
          <IconPlayerPlay size={13} />
          Add chart
        </Button>
        <Button
          variant="ghost"
          onClick={() => setSharing(true)}
          disabled={dashboard === null}
          className="h-7 px-2.5 text-xs"
        >
          Share
        </Button>
        {confirmRemove ? (
          <span className="flex items-center gap-1">
            <Button
              variant="ghost"
              onClick={() => void removeDashboard()}
              className="h-7 px-2 text-xs text-red"
            >
              Confirm
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

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {problem !== null ? <Alert>{problem}</Alert> : null}
        {dashboard === null ? (
          problem === null ? (
            <p className="font-mono text-xs text-muted-foreground">
              Reading the dashboard…
            </p>
          ) : null
        ) : dashboard.widgets.length === 0 ? (
          <EmptyState
            title="No charts yet"
            body="Add a chart, or ask the AI to plot something."
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {dashboard.widgets.map((widget) => (
              <DashboardWidget
                key={widget.id}
                widget={widget}
                onEdit={() => setEditing(widget)}
                onRemove={() => void remove(widget)}
              />
            ))}
          </div>
        )}
      </div>

      {adding ? (
        <WidgetDialog
          dashboardId={dashboardId}
          sources={dashboard?.sources ?? emptySources}
          widget={null}
          onClose={() => setAdding(false)}
          onSaved={saved}
        />
      ) : null}
      {editing !== null ? (
        <WidgetDialog
          dashboardId={dashboardId}
          sources={dashboard?.sources ?? emptySources}
          widget={editing}
          onClose={() => setEditing(null)}
          onSaved={saved}
        />
      ) : null}
      {asking && dashboard !== null ? (
        <AskAiPanel
          dashboard={dashboard}
          onClose={() => setAsking(false)}
          onChanged={(updated) => setDashboard(updated)}
        />
      ) : null}
      {sharing ? (
        <ShareDialog
          dashboardId={dashboardId}
          onClose={() => setSharing(false)}
        />
      ) : null}
    </div>
  );
}

function DashboardWidget({
  widget,
  onEdit,
  onRemove,
}: {
  widget: IWidget;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const [data, setData] = useState<IWidgetData | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    setProblem(null);
    fetchWidgetData(widget.id).then(
      (found) => {
        if (live) {
          setData(found);
        }
      },
      (caught: unknown) => {
        if (live) {
          setProblem(messageFor(caught, "That chart could not be drawn."));
        }
      },
    );
    return () => {
      live = false;
    };
  }, [widget.id]);
  async function refresh(): Promise<void> {
    setRefreshing(true);
    setProblem(null);
    try {
      setData(await refreshWidgetData(widget.id));
    } catch (caught) {
      setProblem(messageFor(caught, "That chart could not be refreshed."));
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <WidgetCard
      title={widget.title}
      chartType={widget.chartType}
      points={data?.points ?? []}
      problem={problem ?? undefined}
      meta={runFacts(data)}
      actions={
        <>
          <Button
            variant="ghost"
            onClick={() => void refresh()}
            disabled={refreshing}
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-fg"
            title="Run the query now and cache it"
          >
            <IconRefresh size={14} />
          </Button>
          <Button
            variant="ghost"
            onClick={onEdit}
            className="h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-fg"
            title={`Edit ${widget.title}`}
          >
            <IconPencil size={14} />
          </Button>
          <Button
            variant="ghost"
            onClick={onRemove}
            className="h-7 w-7 shrink-0 p-0 text-red"
            title={`Remove ${widget.title}`}
          >
            <IconTrash size={14} />
          </Button>
        </>
      }
    />
  );
}

function runFacts(data: IWidgetData | null): string | undefined {
  if (data === null) {
    return undefined;
  }
  if (data.ranAt === null) {
    return "not run yet — press refresh";
  }
  const ran = new Date(data.ranAt).toLocaleTimeString();
  return `${data.rowCount} rows · ran ${ran}${data.stale ? " · stale" : ""}`;
}
