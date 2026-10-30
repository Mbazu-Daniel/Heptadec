import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  mongodb: "MongoDB",
};

export function CreateDashboardDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (dashboardId: string) => void;
}) {
  const sources = useQuery({
    queryKey: ["data-sources"],
    queryFn: listDataSources,
  });
  const providers = useQuery({
    queryKey: ["ai-providers"],
    queryFn: listAiProviders,
  });
  const [name, setName] = useState("");
  const [brief, setBrief] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [withAi, setWithAi] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const sourceList = sources.data?.dataSources ?? null;
  const selected = sourceList?.filter((source) => chosen.includes(source.id)) ?? [];
  const analysable = selected.some((source) => source.tooling);
  const providerCount = providers.data?.providers.length ?? 0;

  const create = useMutation({
    mutationFn: async () => {
      if (buildWithAi) {
        const result = await generateDashboard(
          {
            name: name.trim(),
            dataSourceIds: chosen,
            ...(brief.trim() === "" ? {} : { brief: brief.trim() }),
          },
          { onStatus: setStatus },
        );
        return result.dashboard.id;
      }
      const created = await createDashboard(name.trim(), chosen);
      return created.dashboard.id;
    },
    onSuccess: onCreated,
  });

  const buildWithAi =
    withAi && analysable && providerCount > 0 && !create.isPending;

  function toggle(id: string): void {
    setChosen((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : [...current, id],
    );
  }

  const problem = sources.isError
    ? messageFor(sources.error, "Data sources could not be read.")
    : create.isError
      ? messageFor(create.error, "That dashboard could not be created.")
      : null;

  const ready = name.trim() !== "" && chosen.length > 0 && !create.isPending;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !create.isPending) {
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
            {(sourceList ?? []).map((source) => (
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
            {sourceList !== null && sourceList.length === 0 && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No data sources yet. Connect one first.
              </p>
            )}
            {sourceList === null && (
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
        {providerCount === 0 && (
          <p className="text-xs text-muted-foreground">
            Add an AI provider to build it with AI; you can still create it empty.
          </p>
        )}
        {analysable === false && chosen.length > 0 && (
          <p className="text-xs text-muted-foreground">
            These sources are not AI-ready yet; the dashboard starts empty.
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
            disabled={create.isPending}
            className={SMALL_BUTTON_CLASSNAME}
          >
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!ready}>
            {buildWithAi ? "Create with AI" : "Create dashboard"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
