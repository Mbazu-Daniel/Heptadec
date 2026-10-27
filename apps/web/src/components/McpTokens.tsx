import { useCallback, useEffect, useState, type FormEvent } from "react";
import { IconPlugConnected, IconTrash } from "@tabler/icons-react";
import {
  MCP_TOOLS,
  type IMcpToken,
} from "@heptadec/api/mcp-contracts";
import {
  createMcpToken,
  listMcpTokens,
  messageFor,
  revokeMcpToken,
} from "../api";
import { Button } from "./ui/button";
import { Alert, EmptyState } from "./ui/feedback";
import { FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  SMALL_BUTTON_CLASSNAME,
  TABLE_CELL_CLASSNAME,
  TABLE_CLASSNAME,
  TABLE_HEAD_CLASSNAME,
  TABLE_ROW_CLASSNAME,
  Workspace,
} from "./workspace";

function when(iso: string | null): string {
  return iso === null ? "never" : new Date(iso).toLocaleString();
}

const DEFAULT_CAPABILITIES: string[] = [...MCP_TOOLS];

export function McpTokens({ isOwner }: { isOwner: boolean }) {
  const [tokens, setTokens] = useState<IMcpToken[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<string[]>([
    ...DEFAULT_CAPABILITIES,
  ]);

  function toggleCapability(next: string): void {
    setCapabilities((prev) =>
      prev.includes(next) ? prev.filter((c) => c !== next) : [...prev, next],
    );
  }

  const reload = useCallback(async () => {
    if (!isOwner) {
      return;
    }
    setProblem(null);
    try {
      const listed = await listMcpTokens();
      setTokens(listed.tokens);
    } catch (caught) {
      setProblem(messageFor(caught, "The MCP tokens could not be loaded."));
    }
  }, [isOwner]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function create(event: FormEvent): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const created = await createMcpToken(name, capabilities);
      setIssued(created.token);
      setName("");
      setCapabilities([...DEFAULT_CAPABILITIES]);
      await reload();
    } catch (caught) {
      setProblem(messageFor(caught, "That token could not be created."));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(tokenId: string): Promise<void> {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await revokeMcpToken(tokenId);
      await reload();
      setNotice("That token was revoked.");
    } catch (caught) {
      setProblem(messageFor(caught, "That token could not be revoked."));
    } finally {
      setBusy(false);
    }
  }

  function closeDialog(): void {
    setCreateOpen(false);
    setIssued(null);
  }

  return (
    <Workspace
      view={
        <div className="flex min-h-0 flex-1 flex-col pt-6">
          {isOwner ? (
            <>
              {problem ? <Alert>{problem}</Alert> : null}
              {notice ? <Alert tone="success">{notice}</Alert> : null}

              <div className="px-6 pb-3">
                <Button onClick={() => setCreateOpen(true)}>
                  <IconPlugConnected size={16} strokeWidth={1.5} />
                  New token
                </Button>
              </div>

              {tokens === null ? (
                <p className="px-6 text-xs text-muted-foreground">Loading</p>
              ) : tokens.length === 0 ? (
                <EmptyState
                  title="No MCP tokens yet"
                  body="Create a token to connect an MCP client to this organization."
                />
              ) : (
                <div className="min-h-0 flex-1 overflow-auto px-6">
                  <table className={TABLE_CLASSNAME}>
                    <thead className={TABLE_HEAD_CLASSNAME}>
                      <tr>
                        <th className={TABLE_CELL_CLASSNAME}>Name</th>
                        <th className={TABLE_CELL_CLASSNAME}>Created</th>
                        <th className={TABLE_CELL_CLASSNAME}>Last request</th>
                        <th className={TABLE_CELL_CLASSNAME}>Capabilities</th>
                        <th className={TABLE_CELL_CLASSNAME} />
                      </tr>
                    </thead>
                    <tbody>
                      {tokens.map((token) => (
                        <tr key={token.id} className={TABLE_ROW_CLASSNAME}>
                          <td className={TABLE_CELL_CLASSNAME}>{token.name}</td>
                          <td className={TABLE_CELL_CLASSNAME}>
                            {when(token.createdAt)}
                          </td>
                          <td className={TABLE_CELL_CLASSNAME}>
                            {token.enabled === false
                              ? "revoked"
                              : token.lastRequest === null
                                ? "never"
                                : when(token.lastRequest)}
                          </td>
                          <td className={TABLE_CELL_CLASSNAME}>
                            {token.capabilities.join(", ") || "—"}
                          </td>
                          <td className={`${TABLE_CELL_CLASSNAME} text-right`}>
                            {token.enabled === false ? (
                              <span className="text-xs text-muted-foreground">
                                revoked
                              </span>
                            ) : (
                              <Button
                                variant="ghost"
                                className={`${SMALL_BUTTON_CLASSNAME} text-red`}
                                disabled={busy}
                                onClick={() => void revoke(token.id)}
                              >
                                <IconTrash size={14} strokeWidth={1.5} />
                                Revoke
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              title="Owners only"
            />
          )}

          {createOpen ? (
            <CreateTokenDialog
              name={name}
              issued={issued}
              busy={busy}
              onNameChange={setName}
              onCreate={create}
              onClose={closeDialog}
              capabilities={capabilities}
              onToggleCapability={toggleCapability}
            />
          ) : null}
        </div>
      }
    />
  );
}

function CreateTokenDialog({
  name,
  issued,
  busy,
  onNameChange,
  onCreate,
  onClose,
  capabilities,
  onToggleCapability,
}: {
  name: string;
  issued: string | null;
  busy: boolean;
  onNameChange: (next: string) => void;
  onCreate: (event: FormEvent) => Promise<void>;
  onClose: () => void;
  capabilities: string[];
  onToggleCapability: (tool: string) => void;
}) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{issued === null ? "New MCP token" : "Token issued"}</DialogTitle>
        </DialogHeader>

        {issued === null ? (
          <form onSubmit={onCreate}>
            <FieldGroup>
              <FieldLabel htmlFor="mcp-token-name">Name</FieldLabel>
              <Input
                id="mcp-token-name"
                value={name}
                autoFocus
                placeholder="laptop"
                onChange={(event) => onNameChange(event.target.value)}
              />
            </FieldGroup>
            <FieldGroup>
              <FieldLabel>Permissions</FieldLabel>
              <div className="mb-2 flex flex-wrap gap-3">
                {MCP_TOOLS.map((tool) => (
                  <label
                    key={tool}
                    className={`flex cursor-pointer items-center gap-1.5 rounded border px-2 py-1.5 text-xs ${
                      capabilities.includes(tool)
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={capabilities.includes(tool)}
                      onChange={() => onToggleCapability(tool)}
                      className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary"
                    />
                    {tool}
                  </label>
                ))}
              </div>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || name.trim() === ""}>
                Create
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="grid gap-3">
            <p className="text-xs leading-4 text-muted-foreground">
              Copy it now. It is stored hashed and cannot be shown again.
            </p>
            <code className="block break-all rounded-md border border-border bg-muted px-2 py-1.5 font-mono text-xs">
              {issued}
            </code>
            <p className="text-xs leading-4 text-muted-foreground">
              Point your client at <code className="font-mono">/mcp</code> with
              this token as a bearer credential.
            </p>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}