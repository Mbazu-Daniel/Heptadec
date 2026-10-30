import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconPlus } from "@tabler/icons-react";
import type {
  DataSourceKind,
  ICreateDataSourceRequest,
  IDataSource,
  IStructureSummary,
} from "@heptadec/api/data-source-contracts";
import { ENGINE_SPECS, defaultConnectionMode, isDataSourceKind, kindFromConnectionUrl } from "@heptadec/api/data-source-contracts";
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
} from "./workspace";
import { EngineForm } from "./connection/EngineForm";
import { SourceMenu } from "./connection/SourceMenu";
import { SourceSettingsDialog } from "./connection/SourceSettingsDialog";
import { connectionPayload, PORT_MESSAGE } from "./connection/payload";
import { parseConnectionUrl } from "../lib/connection-url-parser";
import { dataSourceKeys } from "../lib/queries";
import { SourceDetail } from "./SourceDetail";
import { SchemaBrowser } from "./schema/SchemaBrowser";

const ENGINES = Object.keys(ENGINE_SPECS).filter(isDataSourceKind);

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
  openSourceId,
  onOpenSource,
}: {
  openSourceId: string | null;
  onOpenSource: (sourceId: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const sourcesQuery = useQuery({
    queryKey: dataSourceKeys.list,
    queryFn: listDataSources,
  });
  const sources = sourcesQuery.data?.dataSources ?? [];

  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<DataSourceKind>("postgres");
  const [name, setName] = useState("");
  const mode = defaultConnectionMode(kind);
  const [importOpen, setImportOpen] = useState(false);
  const [connectionUrl, setConnectionUrl] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [readOnly, setReadOnly] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<IDataSource | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const settingsSource =
    sources.find((source) => source.id === settingsId) ?? null;
  const opened = sources.find((source) => source.id === openSourceId) ?? null;

  const saveSource = useMutation({
    mutationFn: createDataSource,
    onSuccess: () => {
      setFormOpen(false);
      queryClient.invalidateQueries({ queryKey: dataSourceKeys.list });
    },
  });
  const testConnection = useMutation({ mutationFn: testDataSourceConnection });
  const removeSource = useMutation({
    mutationFn: (source: IDataSource) => deleteDataSource(source.id),
    onSuccess: (_result, source) => {
      if (openSourceId === source.id) {
        onOpenSource(null);
      }
      setRemoveTarget(null);
      queryClient.invalidateQueries({ queryKey: dataSourceKeys.list });
    },
  });

  const pasted =
    importOpen && connectionUrl.trim() !== ""
      ? parseConnectionUrl(connectionUrl, kind)
      : {};
  const fields = Object.keys(pasted).length === 0 ? values : pasted;

  function resetConnection(next: DataSourceKind): void {
    setKind(next);
    setValues({});
    setConnectionUrl("");
    setFormError(null);
    testConnection.reset();
  }

  function toggleUrlImport(): void {
    if (importOpen) {
      setConnectionUrl("");
    }
    setImportOpen(!importOpen);
  }

  function setUrl(next: string): void {
    setConnectionUrl(next);
    const inferred = kindFromConnectionUrl(next);
    if (inferred !== null && inferred !== kind) {
      setKind(inferred);
      testConnection.reset();
    }
  }

  function openForm(): void {
    setName("");
    setReadOnly(false);
    setImportOpen(false);
    resetConnection("postgres");
    setFormOpen(true);
  }

  function buildPayload(): ICreateDataSourceRequest | string {
    if (name.trim().length === 0) {
      return "A name is required";
    }
    if (importOpen && connectionUrl.trim() === "") {
      return "Paste a connection URL";
    }
    const payload = connectionPayload({
      kind,
      mode,
      connectionUrl,
      name,
      readOnly,
      values: fields,
    });
    return payload === null ? PORT_MESSAGE : payload;
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const payload = buildPayload();
    if (typeof payload === "string") {
      setFormError(payload);
      return;
    }
    setFormError(null);
    saveSource.mutate(payload);
  }

  function checkConnection(): void {
    const payload = buildPayload();
    if (typeof payload === "string") {
      setFormError(payload);
      return;
    }
    setFormError(null);
    testConnection.mutate(payload);
  }

  function remove(target: IDataSource): void {
    setRemoveError(null);
    removeSource.mutate(target, {
      onError: (caught) =>
        setRemoveError(messageFor(caught, "The source was not removed.")),
    });
  }

  if (opened !== null) {
    if (opened.queryLanguage !== "sql" && opened.queryLanguage !== "pipeline") {
      return (
        <section className={VIEW_CLASSNAME}>
          <SourceDetail
            key={opened.id}
            source={opened}
            onBack={() => onOpenSource(null)}
          />
        </section>
      );
    }
    return (
      <section className={VIEW_CLASSNAME}>
        <SchemaBrowser
          key={opened.id}
          source={opened}
          onBack={() => onOpenSource(null)}
          onRemove={(target) => remove(target)}
          onBrowseRows={(target, back) => (
            <SourceDetail source={target} onBack={back} />
          )}
        />
      </section>
    );
  }

  return (
    <section className={VIEW_CLASSNAME}>
      <div className="flex shrink-0 items-center gap-2 px-6 py-1.5">
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
            {sourcesQuery.isError ? (
              <Alert className="mb-3">
                {messageFor(sourcesQuery.error, "Sources could not load.")}
              </Alert>
            ) : null}
            {removeError ? <Alert className="mb-3">{removeError}</Alert> : null}

            {sourcesQuery.isPending ? null : sources.length === 0 ? (
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
                      onClick={() => onOpenSource(source.id)}
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
                  onChange={(event) => {
                    if (isDataSourceKind(event.target.value)) {
                      resetConnection(event.target.value);
                    }
                  }}
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
              values={fields}
              showUrlImport={importOpen}
              onUrlChange={setUrl}
              onChange={(field, next) => {
                setConnectionUrl("");
                setValues({ ...fields, [field]: next });
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
            {saveSource.isError ? (
              <Alert>{messageFor(saveSource.error, "The source was not saved.")}</Alert>
            ) : null}
            {testConnection.isError ? (
              <Alert>
                {messageFor(testConnection.error, "The database could not be reached")}
              </Alert>
            ) : null}

            {testConnection.data ? (
              <p role="status" className="font-mono text-xs text-green">
                Reachable — {testConnection.data.total} object
                {testConnection.data.total === 1 ? "" : "s"} found.
              </p>
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
                disabled={testConnection.isPending || saveSource.isPending}
                onClick={checkConnection}
                className="rounded-none"
              >
                {testConnection.isPending ? "Testing…" : "Test connection"}
              </Button>
              <Button type="submit" disabled={saveSource.isPending} className="rounded-none">
                {saveSource.isPending ? "Saving" : "Add source"}
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
            queryClient.invalidateQueries({ queryKey: dataSourceKeys.list });
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
                disabled={removeSource.isPending}
                className="rounded-none bg-red text-background hover:bg-red/85"
                onClick={() => remove(removeTarget)}
              >
                {removeSource.isPending ? "Removing" : "Remove"}
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
