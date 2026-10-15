import { useEffect, useState } from "react";
import { IconLink, IconRefresh, IconTrash } from "@tabler/icons-react";
import type { IShareLink } from "@heptadec/api/share-link-contracts";
import {
  createShareLink,
  deleteShareLink,
  listShareLinks,
  messageFor,
  refreshShareLink,
} from "../../api";
import { Alert, EmptyState } from "../ui/feedback";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { SMALL_BUTTON_CLASSNAME, TOOLBAR_SELECT_CLASSNAME } from "../workspace";

const EXPIRY_CHOICES = [
  { value: "", label: "Never expires" },
  { value: "1", label: "1 day" },
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
] as const;

export function ShareDialog({
  dashboardId,
  onClose,
}: {
  dashboardId: string;
  onClose: () => void;
}) {
  const [links, setLinks] = useState<IShareLink[] | null>(null);
  const [expiresInDays, setExpiresInDays] = useState<string>("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    listShareLinks(dashboardId).then(
      (found) => {
        if (live) {
          setLinks(found.shareLinks);
        }
      },
      (caught: unknown) => {
        if (live) {
          setProblem(messageFor(caught, "Share links could not be read."));
        }
      },
    );
    return () => {
      live = false;
    };
  }, [dashboardId]);

  async function share(): Promise<void> {
    setBusy(true);
    setProblem(null);
    setStatus(null);
    try {
      const { shareLink, url } = await createShareLink(dashboardId, {
        ...(expiresInDays === "" ? {} : { expiresInDays: Number(expiresInDays) }),
      });
      setLinks((current) => [shareLink, ...(current ?? [])]);
      setCreatedUrl(url);
    } catch (caught) {
      setProblem(messageFor(caught, "That link could not be created."));
    } finally {
      setBusy(false);
    }
  }

  async function refresh(id: string): Promise<void> {
    setProblem(null);
    setStatus(null);
    try {
      await refreshShareLink(id);
      setStatus("That link now shows the latest numbers.");
    } catch (caught) {
      setProblem(messageFor(caught, "That link could not be refreshed."));
    }
  }

  async function revoke(link: IShareLink): Promise<void> {
    setProblem(null);
    setStatus(null);
    try {
      await deleteShareLink(link.id);
      setLinks((current) => (current ?? []).filter((entry) => entry.id !== link.id));
      setStatus("That link no longer works.");
    } catch (caught) {
      setProblem(messageFor(caught, "That link could not be revoked."));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share this dashboard</DialogTitle>
        </DialogHeader>

        <p className="text-xs leading-5 text-muted-foreground">
          Anyone with the link sees the dashboard's charts as they are right now.
          The link serves a frozen copy — refreshing it re-runs the queries, and
          revoking it makes the URL stop working immediately.
        </p>

        {problem !== null ? <Alert>{problem}</Alert> : null}
        {status !== null ? (
          <Alert tone="success">{status}</Alert>
        ) : null}

        <div className="flex items-end gap-2">
          <label className="grid gap-1.5">
            <span className="text-xs text-muted-foreground">Link expires</span>
            <select
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value)}
              className={TOOLBAR_SELECT_CLASSNAME}
            >
              {EXPIRY_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </label>
          <Button
            onClick={() => void share()}
            disabled={busy}
            className="h-7 gap-1.5 px-3 text-xs"
          >
            <IconLink size={14} />
            {busy ? "Creating…" : "Create link"}
          </Button>
        </div>

        {createdUrl !== null ? (
          <div className="grid gap-1.5 rounded-md border border-border bg-background p-3">
            <span className="text-[12px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              This is the only time the link is shown
            </span>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg">
                {createdUrl}
              </code>
              <Button
                variant="ghost"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(createdUrl)
                    .then(
                      () => setStatus("Link copied."),
                      () => setStatus("The clipboard would not take it — select and copy the link above."),
                    );
                }}
                className={SMALL_BUTTON_CLASSNAME}
              >
                Copy
              </Button>
            </div>
          </div>
        ) : null}

        {links !== null && links.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {links.map((link) => (
              <li
                key={link.id}
                className="flex items-center gap-3 px-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-fg">
                    {link.expiresAt === null
                      ? "Never expires"
                      : `Expires ${new Date(link.expiresAt).toLocaleDateString()}`}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    Created {new Date(link.createdAt).toLocaleString()}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  onClick={() => void refresh(link.id)}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-fg"
                  title="Refresh the frozen numbers"
                >
                  <IconRefresh size={14} />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void revoke(link)}
                  className="h-7 w-7 p-0 text-red"
                  title="Revoke this link"
                >
                  <IconTrash size={14} />
                </Button>
              </li>
            ))}
          </ul>
        ) : links !== null ? (
          <EmptyState
            className="py-4"
            title="No links yet"
            body="Create one to share this dashboard outside the organization."
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
