import { useEffect, useState } from "react";
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
  const [versions, setVersions] = useState<IQueryVersion[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listQueryVersions(savedQueryId).then(
      (found) => {
        if (live) {
          setVersions(found.versions);
        }
      },
      (caught: unknown) => {
        if (live) {
          setProblem(messageFor(caught, "Versions could not be read."));
        }
      },
    );
    return () => {
      live = false;
    };
  }, [savedQueryId]);

  async function restore(version: IQueryVersion): Promise<void> {
    setRestoring(version.id);
    setProblem(null);
    try {
      await restoreQueryVersion(savedQueryId, version.id);
      onRestored();
      onClose();
    } catch (caught) {
      setProblem(messageFor(caught, "That version could not be restored."));
    } finally {
      setRestoring(null);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
        </DialogHeader>

        <p className="text-xs leading-5 text-muted-foreground">
          Each row is the statement as it stood before an edit. Restoring copies
          one back onto the live query; the version being replaced is kept, so
          that can be undone too.
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
                    onClick={() => void restore(version)}
                    disabled={restoring !== null}
                    className={`${SMALL_BUTTON_CLASSNAME} shrink-0`}
                  >
                    {restoring === version.id ? "Restoring…" : "Restore"}
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
