import { useEffect, useState, type FormEvent } from "react";
import { IconPlus } from "@tabler/icons-react";
import type {
  DataSourceKind,
  ICreateDataSourceRequest,
  IDataSource,
  IStructureSummary,
} from "@heptadec/api/data-source-contracts";
import { ENGINE_SPECS, defaultConnectionMode, kindFromConnectionUrl } from "@heptadec/api/data-source-contracts";
import {
  createDataSource,
  deleteDataSource,
  listDataSources,
  messageFor,
  testDataSourceConnection,
} from "../api";
import { Alert, EmptyState } from "./ui/feedback";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { EngineIcon } from "../lib/engine-icon";
import {
  SMALL_BUTTON_CLASSNAME,
  VIEW_CLASSNAME,
  Workspace,
  type ICrumb,
} from "./workspace";
import { EngineForm } from "./connection/EngineForm";
import { SourceMenu } from "./connection/SourceMenu";
import { SourceSettingsDialog } from "./connection/SourceSettingsDialog";
import { connectionPayload, PORT_MESSAGE } from "./connection/payload";
import { parseConnectionUrl } from "../lib/connection-url-parser";
import { SourceDetail } from "./SourceDetail";
import { SchemaBrowser } from "./schema/SchemaBrowser";

const ENGINES = Object.keys(ENGINE_SPECS) as DataSourceKind[];

type TestState =
  | { status: "idle" }
  | { status: "testing" }
  | { status: "ok"; total: number }
  | { status: "failed"; message: string };
function targetOf(source: IDataSource): string {
  if (source.host === null) {
    return source.database ?? "";
  }
  const endpoint =
    source.port === null ? source.host : `${source.host}:${source.port}`;
  return source.database === null
    ? endpoint
    : `${endpoint} / ${source.database}`;
}

export function DataSources({
  resetToken,
  onTrail,
}: {
  resetToken?: number;
  onTrail?: (crumbs: ICrumb[]) => void;
}) {
  const [sources, setSources] = useState<IDataSource[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [openedId, setOpenedId] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<DataSourceKind>("postgres");
  const [name, setName] = useState("");
  // There is no mode choice in the UI: an engine always connects its default
  // way, so the mode is derived rather than stored.
  const mode = defaultConnectionMode(kind);
  // The URL import starts closed, like a plain field form that can be filled
  // by a paste once the importer is switched on.
  const [importOpen, setImportOpen] = useState(false);
  const [connectionUrl, setConnectionUrl] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [readOnly, setReadOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testState, setTestState] = useState<TestState>({ status: "idle" });

  // An open ellipsis menu points at the source being changed or removed.
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<IDataSource | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const settingsSource =
    sources.find((source) => source.id === settingsId) ?? null;

  async function reload(): Promise<void> {
    try {
      const result = await listDataSources();
      setSources(result.dataSources);
      setListError(null);
    } catch (caught) {
      setListError(messageFor(caught, "Sources could not load."));
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    if (resetToken === undefined) {
      return;
    }
    setOpenedId(null);
  }, [resetToken]);

  useEffect(() => {
    if (openedId === null) {
      onTrail?.([]);
    }
  }, [openedId, onTrail]);

  const opened = sources.find((source) => source.id === openedId) ?? null;

  // A pasted URL is an import: what it parses replaces the fields wholesale.
  useEffect(() => {
    if (connectionUrl.trim() === "") {
      return;
    }
    const parsed = parseConnectionUrl(connectionUrl, kind);
    if (Object.keys(parsed).length === 0) {
      return; // Not a readable URL yet; leave the fields until it is.
    }
    setValues(parsed);
  }, [connectionUrl, kind]);

  function resetConnection(kind: DataSourceKind): void {
    setKind(kind);
    setValues({});
    setConnectionUrl("");
    setFormError(null);
    setTestState({ status: "idle" });
  }

  // Switching the import off discards the paste with it: with the URL box
  // gone there is nowhere for its truth to live, so the fields take over.
  function toggleUrlImport(): void {
    if (importOpen) {
      setConnectionUrl("");
    }
    setImportOpen(!importOpen);
  }

  // The pasted URL names its own engine — the scheme is the same word the
  // server accepts a pasted URL by — so importing has no engine to pick.
  function setUrl(next: string): void {
    setConnectionUrl(next);
    const inferred = kindFromConnectionUrl(next);
    if (inferred !== null && inferred !== kind) {
      setKind(inferred);
      setTestState({ status: "idle" });
    }
  }

  function openForm(): void {
    setName("");
    setReadOnly(false);
    setImportOpen(false);
    resetConnection("postgres");
    setFormOpen(true);
  }

  function buildPayload(): ICreateDataSourceRequest | null {
    return connectionPayload({
      kind,
      mode,
      connectionUrl,
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
    if (importOpen && connectionUrl.trim() === "") {
      setFormError("Paste a connection URL");
      return;
    }
    const payload = buildPayload();
    if (payload === null) {
      setFormError(PORT_MESSAGE);
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await createDataSource(payload);
      setFormOpen(false);
      await reload();
    } catch (caught) {
      setFormError(messageFor(caught, "The source was not saved."));
    } finally {
      setBusy(false);
    }
  }

  async function testConnection(): Promise<void> {
    if (importOpen && connectionUrl.trim() === "") {
      setTestState({ status: "failed", message: "Paste a connection URL" });
      return;
    }
    const payload = buildPayload();
    if (payload === null) {
      setTestState({ status: "failed", message: PORT_MESSAGE });
      return;
    }
    setTestState({ status: "testing" });
    setFormError(null);
    try {
      const result = await testDataSourceConnection(payload);
      setTestState({ status: "ok", total: result.total });
    } catch (caught) {
      setTestState({
        status: "failed",
        message: messageFor(caught, "The database could not be reached"),
      });
    }
  }

  async function remove(target: IDataSource): Promise<void> {
    setRemoving(true);
    setRemoveError(null);
    try {
      await deleteDataSource(target.id);
      if (openedId === target.id) {
        setOpenedId(null);
      }
      setRemoveTarget(null);
      await reload();
    } catch (caught) {
      setRemoveError(messageFor(caught, "The source was not removed."));
    } finally {
      setRemoving(false);
    }
  }

  if (opened !== null) {
    // A source whose statements are SQL or an aggregation pipeline reports a
    // structure the app can read and diagram. A command or search source has
    // nothing to introspect, so it keeps the plain detail view.
    if (opened.queryLanguage !== "sql" && opened.queryLanguage !== "pipeline") {
      return (
        <section className={VIEW_CLASSNAME}>
          <SourceDetail
            key={opened.id}
            source={opened}
            onBack={() => setOpenedId(null)}
          />
        </section>
      );
    }
    return (
      <section className={VIEW_CLASSNAME}>
        <SchemaBrowser
          key={opened.id}
          source={opened}
          onTrail={onTrail}
          onBack={() => setOpenedId(null)}
          onRemove={async (target) => {
            setListError(null);
            try {
              await deleteDataSource(target.id);
              setOpenedId(null);
              await reload();
            } catch (caught) {
              setListError(messageFor(caught, "The source was not removed."));
            }
          }}
          onBrowseRows={(target, back) => (
            <SourceDetail source={target} onBack={back} />
          )}
        />
      </section>
    );
  }

  return (
    <section className={VIEW_CLASSNAME}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {sources.length} connected
        </span>
      </div>

      <div className="flex items-center gap-2 px-6 py-3">
        <Button
          className="ml-auto h-9 gap-1.5 px-4 text-sm"
          onClick={openForm}
        >
          <IconPlus size={16} />
          Add source
        </Button>
      </div>

      <Workspace
        view={
          <>
            {listError ? <Alert className="mb-3">{listError}</Alert> : null}

            {!loaded ? null : sources.length === 0 ? (
              <>
                <EmptyState
                  title="No data sources yet"
                  body="Connect your first database to query it and map its schema."
                />
                <div className="pb-8 text-center">
                  <Button
                    className={SMALL_BUTTON_CLASSNAME}
                    onClick={openForm}
                  >
                    Add source
                  </Button>
                </div>
              </>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {sources.map((source) => (
                  <li key={source.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenedId(source.id)}
                      className="flex min-h-36 w-full flex-col justify-center gap-3 border border-border bg-card/30 p-6 pr-12 text-left transition-colors hover:border-cyan/40"
                    >
                      <span className="flex items-center gap-3">
                        <EngineIcon name={source.kind} className="size-8" />
                        <span className="min-w-0 flex-1 truncate text-base font-semibold">
                          {source.name}
                        </span>
                      </span>
                      <span className="truncate font-mono text-sm text-muted-foreground">
                        {targetOf(source)}
                      </span>
                      {source.structure === null ? null : (
                        <StructureLine structure={source.structure} />
                      )}
                    </button>
                    <SourceMenu
                      className="absolute top-2 right-2"
                      onSettings={() => setSettingsId(source.id)}
                      onRemove={() => {
                        setRemoveError(null);
                        setRemoveTarget(source);
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </>
        }
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg gap-5 rounded-none border-border bg-card">
          <DialogHeader className="flex-row items-center justify-between">
            <DialogTitle className="text-sm font-semibold">Add a data source</DialogTitle>
            {ENGINE_SPECS[kind].acceptsConnectionUrl ? (
              <button
                type="button"
                onClick={toggleUrlImport}
                aria-pressed={importOpen}
                className={
                  importOpen
                    ? "text-xs font-medium text-fg underline underline-offset-2"
                    : "text-xs font-medium text-muted-foreground transition-colors hover:text-fg"
                }
              >
                Import from URL
              </button>
            ) : null}
          </DialogHeader>

          <form className="grid gap-4" onSubmit={submit}>
            {importOpen ? null : (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted-foreground">Engine</span>
                <select
                  value={kind}
                  onChange={(event) =>
                    resetConnection(event.target.value as DataSourceKind)
                  }
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                >
                  {ENGINES.map((option) => (
                    <option key={option} value={option}>
                      {ENGINE_SPECS[option].name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Name</span>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                maxLength={80}
                placeholder="Production replica"
                className="rounded-none"
              />
            </label>

            {importOpen &&
            connectionUrl.trim() !== "" &&
            kindFromConnectionUrl(connectionUrl) === null ? (
              <p className="text-xs text-muted-foreground">
                Only postgresql:, mysql:, redis: or mongodb: — or ClickHouse on
                8123 — can be imported.
              </p>
            ) : null}

            <EngineForm
              kind={kind}
              mode={mode}
              url={connectionUrl}
              values={values}
              showUrlImport={importOpen}
              onUrlChange={setUrl}
              onChange={(field, next) => {
                // A hand edit takes over from the paste: the typed fields are
                // what gets sent, so the URL stops being the source of truth.
                setConnectionUrl("");
                setValues((current) => ({ ...current, [field]: next }));
              }}
            />

            {importOpen ? null : (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={readOnly}
                  onChange={(event) => setReadOnly(event.target.checked)}
                  className="size-4 accent-cyan"
                />
                <span className="text-xs text-muted-foreground">Read-only</span>
              </label>
            )}

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
                onClick={() => setFormOpen(false)}
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
                {testState.status === "testing"
                  ? "Testing…"
                  : "Test connection"}
              </Button>
              <Button type="submit" disabled={busy} className="rounded-none">
                {busy ? "Saving" : "Add source"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {settingsSource === null ? null : (
        <SourceSettingsDialog
          key={settingsSource.id}
          source={settingsSource}
          onOpenChange={(open) => {
            if (!open) {
              setSettingsId(null);
            }
          }}
          onSaved={() => {
            setSettingsId(null);
            void reload();
          }}
        />
      )}

      {removeTarget === null ? null : (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setRemoveTarget(null);
            }
          }}
        >
          <DialogContent className="max-w-sm gap-4 rounded-none border-border bg-card">
            <DialogHeader>
              <DialogTitle className="text-sm font-semibold">
                Remove {removeTarget.name}?
              </DialogTitle>
            </DialogHeader>

            <p className="text-xs text-muted-foreground">
              The stored password is deleted; saved queries are kept.
            </p>

            {removeError ? <Alert>{removeError}</Alert> : null}

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setRemoveTarget(null)}
                className="rounded-none"
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={removing}
                className="rounded-none bg-red text-background hover:bg-red/85"
                onClick={() => void remove(removeTarget)}
              >
                {removing ? "Removing" : "Remove"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}

/**
 * Where the app's reading of this source stands, in the one line a card can spare.
 *
 * The list carries this so a card can say "still being read" without opening any
 * user's database to find out. A structure that is ready and fresh has nothing to
 * report, which is why the line is absent rather than green.
 */
function StructureLine({ structure }: { structure: IStructureSummary }) {
  const said = structure.syncing
    ? { text: "Reading its structure…", tone: "text-amber-600" }
    : structure.state === "failed"
      ? { text: "Its structure could not be read", tone: "text-red" }
      : structure.stale
        ? { text: "Structure is out of date", tone: "text-amber-600" }
        : null;
  if (said === null) {
    return null;
  }
  return <span className={`text-[11px] ${said.tone}`}>{said.text}</span>;
}
