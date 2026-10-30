import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconPencil,
  IconPlayerPlay,
  IconRefresh,
  IconSparkles,
  IconTrash,
} from "@tabler/icons-react";
import type {
  IDashboardSource,
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
  const queryClient = useQueryClient();
  const dashboardKey = ["dashboard", dashboardId] as const;
  const dashboardQuery = useQuery({
    queryKey: dashboardKey,
    queryFn: () => fetchDashboard(dashboardId),
  });
  const dashboard = dashboardQuery.data?.dashboard ?? null;
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<IWidget | null>(null);
  const [sharing, setSharing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const removeWidget = useMutation({
    mutationFn: (widget: IWidget) => deleteWidget(widget.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dashboardKey }),
  });
  const removeDashboard = useMutation({
    mutationFn: () => deleteDashboard(dashboardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      onBack();
    },
  });

  function saved(): void {
    queryClient.invalidateQueries({ queryKey: dashboardKey });
    setAdding(false);
    setEditing(null);
  }

  return (
    <div className={VIEW_CLASSNAME}>
      <div className="flex shrink-0 items-center gap-2 px-6 py-1.5">
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
        <Button
          variant="ghost"
          onClick={() => setAsking(true)}
          disabled={dashboard === null}
          className="ml-auto h-7 gap-1.5 px-2.5 text-xs"
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
              onClick={() => removeDashboard.mutate()}
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
        {dashboardQuery.isError ? (
          <Alert>
            {messageFor(dashboardQuery.error, "That dashboard could not be read.")}
          </Alert>
        ) : null}
        {removeWidget.isError ? (
          <Alert>
            {messageFor(removeWidget.error, "That chart could not be removed.")}
          </Alert>
        ) : null}
        {removeDashboard.isError ? (
          <Alert>
            {messageFor(removeDashboard.error, "That dashboard could not be removed.")}
          </Alert>
        ) : null}
        {dashboard === null ? (
          dashboardQuery.isPending ? (
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
                onRemove={() => removeWidget.mutate(widget)}
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
          onChanged={(updated) =>
            queryClient.setQueryData(dashboardKey, { dashboard: updated })
          }
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
  const queryClient = useQueryClient();
  const widgetKey = ["widget-data", widget.id] as const;
  const dataQuery = useQuery({
    queryKey: widgetKey,
    queryFn: () => fetchWidgetData(widget.id),
    staleTime: Infinity,
  });
  const refresh = useMutation({
    mutationFn: () => refreshWidgetData(widget.id),
    onSuccess: (found) => queryClient.setQueryData(widgetKey, found),
  });
  const data: IWidgetData | null = dataQuery.data ?? null;
  const problem = dataQuery.isError
    ? messageFor(dataQuery.error, "That chart could not be drawn.")
    : refresh.isError
      ? messageFor(refresh.error, "That chart could not be refreshed.")
      : null;

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
            onClick={() => refresh.mutate()}
            disabled={refresh.isPending}
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
