import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { IconSparkles, IconTrash } from "@tabler/icons-react";
import type {
  IDashboardProposal,
  IDashboardWithWidgets,
  IProposalAction,
} from "@heptadec/api/dashboard-contracts";
import { applyDashboardActions, askDashboard, messageFor } from "../../api";
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
import { SMALL_BUTTON_CLASSNAME } from "../workspace";

const MAX_QUESTION = 2_000;

export function AskAiPanel({
  dashboard,
  onClose,
  onChanged,
}: {
  dashboard: IDashboardWithWidgets;
  onClose: () => void;
  onChanged: (updated: IDashboardWithWidgets) => void;
}) {
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [proposal, setProposal] = useState<IDashboardProposal | null>(null);
  const [approved, setApproved] = useState<number[]>([]);
  const [refused, setRefused] = useState<string | null>(null);

  const analysable = dashboard.sources.filter((source) => source.tooling);

  const ask = useMutation({
    mutationFn: () =>
      askDashboard(dashboard.id, question.trim(), { onStatus: setStatus }),
    onSuccess: (result) => {
      setProposal(result.proposal);
      setApproved(result.proposal.actions.map((_action, index) => index));
      setRefused(null);
    },
  });

  const apply = useMutation({
    mutationFn: () => {
      const actions = (proposal?.actions ?? []).filter((_action, index) =>
        approved.includes(index),
      );
      return applyDashboardActions(dashboard.id, actions);
    },
    onSuccess: (result) => {
      onChanged(result.dashboard);
      const rejected = result.applied.filter((entry) => entry.problem !== null);
      if (rejected.length === 0) {
        onClose();
        return;
      }
      setProposal(null);
      setRefused(
        rejected
          .map((entry) => {
            const action = proposal?.actions[entry.index];
            const label =
              action === undefined ? "A change" : describe(action, dashboard);
            return `${label} — ${entry.problem}`;
          })
          .join("\n"),
      );
    },
  });

  function toggle(index: number): void {
    setApproved((current) =>
      current.includes(index)
        ? current.filter((entry) => entry !== index)
        : [...current, index],
    );
  }

  function askNow(): void {
    if (question.trim() !== "" && !ask.isPending && !apply.isPending) {
      setProposal(null);
      setStatus("Reading the structure…");
      ask.mutate();
    }
  }

  const problem = ask.isError
    ? messageFor(ask.error, "That request could not be answered.")
    : apply.isError
      ? messageFor(apply.error, "Those changes could not be applied.")
      : refused;

  const asking = question.trim() !== "" && !ask.isPending && !apply.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && !ask.isPending && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconSparkles size={18} strokeWidth={1.5} />
            Ask AI about this dashboard
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {dashboard.sources.map((source) => (
            <span
              key={source.dataSourceId}
              className="rounded-md border px-2 py-0.5 text-xs text-muted-foreground"
            >
              {source.name}
            </span>
          ))}
        </div>
        {analysable.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Only Postgres sources can be analysed yet.
          </p>
        )}

        <div className="flex gap-2">
          <Input
            value={question}
            maxLength={MAX_QUESTION}
            placeholder="Add a chart of daily signups from the last 30 days"
            aria-label="What should change"
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                askNow();
              }
            }}
          />
          <Button
            onClick={askNow}
            disabled={!asking || analysable.length === 0}
            className={SMALL_BUTTON_CLASSNAME}
          >
            Ask
          </Button>
        </div>

        {status !== null && ask.isPending && (
          <p className="text-xs text-muted-foreground">{status}</p>
        )}

        {proposal !== null && (
          <div className="rounded-md border">
            <p className="border-b px-3 py-2 text-sm">{proposal.summary}</p>
            {proposal.actions.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Nothing needs to change.
              </p>
            )}
            {proposal.actions.map((action, index) => (
              <label
                key={index}
                className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={approved.includes(index)}
                  onChange={() => toggle(index)}
                  className="size-4 accent-primary"
                />
                <span
                  className={
                    action.kind === "remove" ? "flex-1 text-muted-foreground" : "flex-1"
                  }
                >
                  {describe(action, dashboard)}
                </span>
                {action.kind === "remove" && (
                  <IconTrash size={14} className="text-muted-foreground" />
                )}
              </label>
            ))}
          </div>
        )}

        {problem !== null && <Alert>{problem}</Alert>}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={ask.isPending || apply.isPending}
            className={SMALL_BUTTON_CLASSNAME}
          >
            Close
          </Button>
          {proposal !== null && (
            <Button
              onClick={() => apply.mutate()}
              disabled={apply.isPending || approved.length === 0}
            >
              {apply.isPending
                ? "Applying…"
                : `Apply ${approved.length} change${approved.length === 1 ? "" : "s"}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function describe(
  action: IProposalAction,
  dashboard: IDashboardWithWidgets,
): string {
  if (action.kind === "remove") {
    return `Remove ${chartTitle(action.widgetId, dashboard)}`;
  }
  if (action.kind === "update") {
    return `Update ${chartTitle(action.widgetId, dashboard)}`;
  }
  const source = dashboard.sources.find(
    (entry) => entry.dataSourceId === action.sourceId,
  );
  const from = source === undefined ? "an unconnected source" : source.name;
  return `Add ${action.title} (${action.chartType}, from ${from})`;
}

function chartTitle(
  widgetId: string,
  dashboard: IDashboardWithWidgets,
): string {
  const found = dashboard.widgets.find((entry) => entry.id === widgetId);
  return found === undefined ? "a chart" : found.title;
}
