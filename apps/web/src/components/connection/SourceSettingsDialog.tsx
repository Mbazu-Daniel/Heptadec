import { useEffect, useState, type FormEvent } from "react";
import type { IDataSource } from "@heptadec/api/data-source-contracts";
import { ENGINE_SPECS, isPreviewEngine } from "@heptadec/api/data-source-contracts";
import { messageFor, testDataSourceConnection, updateDataSource } from "../../api";
import { Alert } from "../ui/feedback";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { EngineFields } from "./EngineForm";
import { connectionPayload, PORT_MESSAGE } from "./payload";

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; total: number }
  | { status: "failed"; message: string };

/**
 * The stored values as the form expects them. A secret is deliberately absent:
 * it is never sent back to the browser, so its field starts blank and a blank
 * one keeps the value already sealed on the source.
 */
function prefilledValues(source: IDataSource): Record<string, string> {
  return {
    host: source.host ?? "",
    port: source.port === null ? "" : String(source.port),
    socketPath: source.socketPath ?? "",
    database: source.database ?? "",
    filePath: source.database ?? "",
    endpoint: source.host ?? "",
    schema: source.schemaName ?? "",
    options: source.options ?? "",
    username: source.username ?? "",
  };
}

/**
 * Which secrets the source already holds, by label. The values themselves are
 * never sent to the browser, so the form can only say that one is there.
 */
function storedSecrets(source: IDataSource): readonly string[] {
  const held: readonly [string, boolean][] = [
    ["Password", source.hasSecret],
    ["Token", source.hasToken],
    ["CA certificate", source.hasCaCert],
    ["Client certificate", source.hasClientCert],
    ["Client key", source.hasClientKey],
  ];
  return held.flatMap(([label, present]) => (present ? [label] : []));
}

export function SourceSettingsDialog({
  source,
  onOpenChange,
  onSaved,
}: {
  source: IDataSource;
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: IDataSource) => void;
}) {
  const spec = ENGINE_SPECS[source.kind];
  const [name, setName] = useState(source.name);
  // The mode is how the source already connects; settings can only change
  // the fields the mode shows.
  const mode = source.connectionMode;
  const [values, setValues] = useState<Record<string, string>>(() =>
    prefilledValues(source),
  );
  const [readOnly, setReadOnly] = useState(source.readOnly);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testState, setTestState] = useState<TestState>({ status: "idle" });

  useEffect(() => {
    setName(source.name);
    setValues(prefilledValues(source));
    setReadOnly(source.readOnly);
    setFormError(null);
    setTestState({ status: "idle" });
  }, [source]);

  function payload() {
    return connectionPayload({
      kind: source.kind,
      mode,
      name,
      readOnly,
      values,
    });
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (name.trim().length === 0) {
      setFormError("A name is required");
      return;
    }
    const body = payload();
    if (body === null) {
      setFormError(PORT_MESSAGE);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      const result = await updateDataSource(source.id, body);
      onSaved(result.dataSource);
    } catch (caught) {
      setFormError(messageFor(caught, "The source was not saved."));
    } finally {
      setBusy(false);
    }
  }

  async function testConnection(): Promise<void> {
    const body = payload();
    if (body === null) {
      setTestState({ status: "failed", message: PORT_MESSAGE });
      return;
    }
    setTestState({ status: "testing" });
    setFormError(null);
    try {
      const result = await testDataSourceConnection(body);
      setTestState({ status: "ok", total: result.total });
    } catch (caught) {
      setTestState({
        status: "failed",
        message: messageFor(caught, "The database could not be reached"),
      });
    }
  }

  const stored = storedSecrets(source);

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-5 rounded-none border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">
            {source.name}
            {isPreviewEngine(source.kind) ? (
              <span className="ml-2 text-[11px] font-normal text-amber-600">
                preview
              </span>
            ) : null}
          </DialogTitle>
          <p className="font-mono text-[11px] text-muted-foreground">
            {spec.name} · the engine itself cannot be changed here
          </p>
        </DialogHeader>

        <form className="grid gap-4" onSubmit={submit}>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Name</span>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              maxLength={80}
              className="rounded-none"
            />
          </label>

          <EngineFields
            kind={source.kind}
            mode={mode}
            values={values}
            onChange={(field, next) =>
              setValues((current) => ({ ...current, [field]: next }))
            }
          />

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(event) => setReadOnly(event.target.checked)}
              className="size-4 accent-cyan"
            />
            <span className="text-xs text-muted-foreground">Read-only</span>
          </label>

          {stored.length > 0 ? (
            <p className="font-mono text-[11px] text-muted-foreground">
              Saved: {stored.join(", ")}. Leave a secret blank to keep it.
            </p>
          ) : null}

          {formError ? <Alert>{formError}</Alert> : null}

          {testState.status === "ok" ? (
            <p role="status" className="font-mono text-xs text-green">
              Reachable — {testState.total} object
              {testState.total === 1 ? "" : "s"} found.
            </p>
          ) : null}
          {testState.status === "failed" ? (
            <Alert>{testState.message}</Alert>
          ) : null}

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="rounded-none"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={testState.status === "testing" || busy}
              onClick={() => void testConnection()}
              className="rounded-none"
            >
              {testState.status === "testing" ? "Testing…" : "Test connection"}
            </Button>
            <Button type="submit" disabled={busy} className="rounded-none">
              {busy ? "Saving" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
