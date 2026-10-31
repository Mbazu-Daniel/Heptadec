import { useMutation, useQuery } from "@tanstack/react-query";
import { IconHistory } from "@tabler/icons-react";
import type { IQueryVersion } from "@heptadec/api/saved-query-contracts";
import { listQueryVersions, messageFor, restoreQueryVersion } from "../../api";
import { Alert, EmptyState } from "../ui/feedback";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { SMALL_BUTTON_CLASSNAME } from "../workspace";

export function VersionHistory({
  savedQueryId,
  onRestored,
  onClose,
}: {
  savedQueryId: string;
  onRestored: () => void;
  onClose: () => void;
}) {
  const versionsQuery = useQuery({
    queryKey: ["query-versions", savedQueryId],
    queryFn: () => listQueryVersions(savedQueryId),
  });
  const versions = versionsQuery.data?.versions ?? null;

  const restore = useMutation({
    mutationFn: (version: IQueryVersion) =>
      restoreQueryVersion(savedQueryId, version.id),
    onSuccess: () => {
      onRestored();
      onClose();
    },
  });

  const problem =
    versionsQuery.isError
      ? messageFor(versionsQuery.error, "Versions could not be read.")
      : restore.isError
        ? messageFor(restore.error, "That version could not be restored.")
        : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
        </DialogHeader>

        <p className="text-xs leading-5 text-muted-foreground">
          Restoring copies a version back onto the live query; the replaced one is kept.
        </p>

        {problem !== null ? <Alert>{problem}</Alert> : null}

        {versions === null ? (
          <p className="font-mono text-xs text-muted-foreground">Reading history…</p>
        ) : versions.length === 0 ? (
          <EmptyState
            className="py-4"
            title="No earlier versions"
            body="This query has not been edited since it was saved."
          />
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {versions.map((version) => (
              <li key={version.id} className="grid gap-2 px-3 py-2.5">
                <div className="flex items-center gap-3 text-xs">
                  <IconHistory size={13} className="shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium text-fg">
                    {version.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
                    {new Date(version.createdAt).toLocaleString()}
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => restore.mutate(version)}
                    disabled={restore.isPending}
                    className={`${SMALL_BUTTON_CLASSNAME} shrink-0`}
                  >
                    {restore.isPending && restore.variables === version
                      ? "Restoring…"
                      : "Restore"}
                  </Button>
                </div>
                <pre className="max-h-32 overflow-auto rounded bg-muted px-2.5 py-2 font-mono text-[12px] leading-4 text-muted-foreground">
                  {version.sql}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
