import { useState } from "react";
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
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [proposal, setProposal] = useState<IDashboardProposal | null>(null);
  const [approved, setApproved] = useState<number[]>([]);

  const analysable = dashboard.sources.filter(
    (source) => source.kind === "postgres",
  );

  async function ask(): Promise<void> {
    const asked = question.trim();
    if (asked === "" || busy) {
      return;
    }
    setBusy(true);
    setProblem(null);
    setProposal(null);
    setStatus("Reading the structure…");
    try {
      const result = await askDashboard(dashboard.id, asked, {
        onStatus: setStatus,
      });
      setProposal(result.proposal);
      setApproved(result.proposal.actions.map((_action, index) => index));
    } catch (caught) {
      setProblem(messageFor(caught, "That request could not be answered."));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function apply(): Promise<void> {
    if (proposal === null || applying) {
      return;
    }
    const actions = proposal.actions.filter((_action, index) =>
      approved.includes(index),
    );
    if (actions.length === 0) {
      return;
    }
    setApplying(true);
    setProblem(null);
    try {
      const result = await applyDashboardActions(dashboard.id, actions);
      onChanged(result.dashboard);
      const refused = result.applied.filter((entry) => entry.problem !== null);
      if (refused.length === 0) {
        onClose();
        return;
      }
      setProposal(null);
      setProblem(
        refused
          .map((entry) => {
            const action = proposal.actions[entry.index];
            const label =
              action === undefined ? "A change" : describe(action, dashboard);
            return `${label} — ${entry.problem}`;
          })
          .join("\n"),
      );
    } catch (caught) {
      setProblem(messageFor(caught, "Those changes could not be applied."));
    } finally {
      setApplying(false);
    }
  }

  function toggle(index: number): void {
    setApproved((current) =>
      current.includes(index)
        ? current.filter((entry) => entry !== index)
        : [...current, index],
    );
  }

  const asking = question.trim() !== "" && !busy && !applying;

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
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
            Only Postgres sources can be analysed yet, so there is nothing for
            the AI to read here.
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
                void ask();
              }
            }}
          />
          <Button
            onClick={() => void ask()}
            disabled={!asking || analysable.length === 0}
            className={SMALL_BUTTON_CLASSNAME}
          >
            Ask
          </Button>
        </div>

        {status !== null && (
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
            disabled={busy || applying}
            className={SMALL_BUTTON_CLASSNAME}
          >
            Close
          </Button>
          {proposal !== null && (
            <Button
              onClick={() => void apply()}
              disabled={applying || approved.length === 0}
            >
              {applying
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
