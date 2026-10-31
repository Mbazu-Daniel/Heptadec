import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const linksKey = ["share-links", dashboardId] as const;
  const links = useQuery({
    queryKey: linksKey,
    queryFn: () => listShareLinks(dashboardId),
  });
  const [expiresInDays, setExpiresInDays] = useState<string>("");
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const share = useMutation({
    mutationFn: async () => {
      const { url } = await createShareLink(dashboardId, {
        ...(expiresInDays === "" ? {} : { expiresInDays: Number(expiresInDays) }),
      });
      return url;
    },
    onSuccess: (url) => {
      setCreatedUrl(url);
      setStatus(null);
      queryClient.invalidateQueries({ queryKey: linksKey });
    },
  });
  const refresh = useMutation({
    mutationFn: (id: string) => refreshShareLink(id),
    onSuccess: () => {
      setStatus("That link now shows the latest numbers.");
      queryClient.invalidateQueries({ queryKey: linksKey });
    },
  });
  const revoke = useMutation({
    mutationFn: (link: IShareLink) => deleteShareLink(link.id),
    onSuccess: () => {
      setStatus("That link no longer works.");
      queryClient.invalidateQueries({ queryKey: linksKey });
    },
  });

  const problem = links.isError
    ? messageFor(links.error, "Share links could not be read.")
    : share.isError
      ? messageFor(share.error, "That link could not be created.")
      : refresh.isError
        ? messageFor(refresh.error, "That link could not be refreshed.")
        : revoke.isError
          ? messageFor(revoke.error, "That link could not be revoked.")
          : null;

  const shareLinks = links.data?.shareLinks ?? null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share this dashboard</DialogTitle>
        </DialogHeader>

        <p className="text-xs leading-5 text-muted-foreground">
          The link serves a frozen copy of the charts; revoking it stops working immediately.
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
            onClick={() => share.mutate()}
            disabled={share.isPending}
            className="h-7 gap-1.5 px-3 text-xs"
          >
            <IconLink size={14} />
            {share.isPending ? "Creating…" : "Create link"}
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

        {shareLinks !== null && shareLinks.length > 0 ? (
          <ul className="divide-y divide-border rounded-md border border-border">
            {shareLinks.map((link) => (
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
                  onClick={() => refresh.mutate(link.id)}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-fg"
                  title="Refresh the frozen numbers"
                >
                  <IconRefresh size={14} />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => revoke.mutate(link)}
                  className="h-7 w-7 p-0 text-red"
                  title="Revoke this link"
                >
                  <IconTrash size={14} />
                </Button>
              </li>
            ))}
          </ul>
        ) : shareLinks !== null ? (
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
