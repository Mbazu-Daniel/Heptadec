import { useEffect, useState } from "react";
import type { IDataSource } from "@heptadec/api/data-source-contracts";
import {
  createDashboard,
  generateDashboard,
  listAiProviders,
  listDataSources,
  messageFor,
} from "../../api";
import { Alert } from "../ui/feedback";
import { Button } from "../ui/button";
import { FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { SMALL_BUTTON_CLASSNAME } from "../workspace";

const MAX_NAME = 120;

const MAX_BRIEF = 400;

const ENGINE_LABELS: Record<string, string> = {
  postgres: "Postgres",
  mysql: "MySQL",
  mariadb: "MariaDB",
  sqlite: "SQLite",
  clickhouse: "ClickHouse",
  libsql: "LibSQL",
  redis: "Redis",
  quickwit: "Quickwit",
};

export function CreateDashboardDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (dashboardId: string) => void;
}) {
  const [sources, setSources] = useState<IDataSource[] | null>(null);
  const [providerCount, setProviderCount] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [withAi, setWithAi] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listDataSources().then(
      (found) => {
        if (live) {
          setSources(found.dataSources);
        }
      },
      (caught: unknown) => {
        if (live) {
          setProblem(
            messageFor(caught, "Data sources could not be read."),
          );
        }
      },
    );
    listAiProviders().then(
      (found) => {
        if (live) {
          setProviderCount(found.providers.length);
        }
      },
      () => {
        if (live) {
          setProviderCount(0);
        }
      },
    );
    return () => {
      live = false;
    };
  }, []);

  const selected = sources?.filter((source) => chosen.includes(source.id)) ?? [];
  const analysable = selected.some((source) => source.kind === "postgres");
  const buildWithAi =
    withAi && analysable && (providerCount ?? 0) > 0 && !busy;

  function toggle(id: string): void {
    setChosen((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  }

  async function submit(): Promise<void> {
    setProblem(null);
    setStatus(buildWithAi ? "Reading the structure…" : null);
    setBusy(true);
    try {
      if (buildWithAi) {
        const result = await generateDashboard(
          {
            name: name.trim(),
            dataSourceIds: chosen,
            ...(brief.trim() === "" ? {} : { brief: brief.trim() }),
          },
          { onStatus: setStatus },
        );
        onCreated(result.dashboard.id);
        return;
      }
      const created = await createDashboard(name.trim(), chosen);
      onCreated(created.dashboard.id);
    } catch (caught) {
      setBusy(false);
      setStatus(null);
      setProblem(messageFor(caught, "That dashboard could not be created."));
    }
  }

  const ready = name.trim() !== "" && chosen.length > 0 && !busy;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New dashboard</DialogTitle>
        </DialogHeader>

        <FieldGroup>
          <FieldLabel htmlFor="dashboard-name">Name</FieldLabel>
          <Input
            id="dashboard-name"
            value={name}
            maxLength={MAX_NAME}
            placeholder="Weekly revenue"
            onChange={(event) => setName(event.target.value)}
          />
        </FieldGroup>

        <FieldGroup>
          <FieldLabel>Data sources</FieldLabel>
          <div className="max-h-56 overflow-y-auto rounded-md border">
            {(sources ?? []).map((source) => (
              <label
                key={source.id}
                className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(source.id)}
                  onChange={() => toggle(source.id)}
                  className="size-4 accent-primary"
                />
                <span className="flex-1 truncate">{source.name}</span>
                <span className="text-xs text-muted-foreground">
                  {ENGINE_LABELS[source.kind] ?? source.kind}
                </span>
              </label>
            ))}
            {sources !== null && sources.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No data sources yet. Connect one first.
              </p>
            )}
            {sources === null && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                Loading…
              </p>
            )}
          </div>
        </FieldGroup>

        <FieldGroup>
          <FieldLabel htmlFor="dashboard-brief">
            What should it show?
          </FieldLabel>
          <Textarea
            id="dashboard-brief"
            value={brief}
            maxLength={MAX_BRIEF}
            rows={2}
            placeholder="Revenue and order volume by week, and the top regions"
            onChange={(event) => setBrief(event.target.value)}
          />
        </FieldGroup>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={withAi}
            onChange={(event) => setWithAi(event.target.checked)}
            className="size-4 accent-primary"
          />
          Build it with AI
        </label>
        {(providerCount ?? 0) === 0 && (
          <p className="text-xs text-muted-foreground">
            Add an AI provider under AI providers to use this. You can still
            create an empty dashboard and add charts by hand.
          </p>
        )}
        {analysable === false && chosen.length > 0 && (
          <p className="text-xs text-muted-foreground">
            None of these can be analysed yet — only Postgres can. The dashboard
            will be created with them connected.
          </p>
        )}

        {status !== null && (
          <p className="text-xs text-muted-foreground">{status}</p>
        )}
        {problem !== null && <Alert>{problem}</Alert>}

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            disabled={busy}
            className={SMALL_BUTTON_CLASSNAME}
          >
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!ready}>
            {buildWithAi ? "Create with AI" : "Create dashboard"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
