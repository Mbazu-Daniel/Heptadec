import { useEffect, useState, type FormEvent } from "react";
import { IconPlus } from "@tabler/icons-react";
import type {
  ConnectionFieldKind,
  DataSourceKind,
  ICreateDataSourceRequest,
  IDataSource,
} from "@heptadec/api/data-source-contracts";
import { ENGINE_SPECS, PORT_MAX, PORT_MIN } from "@heptadec/api/data-source-contracts";
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
import { cn } from "@/lib/utils";
import {
  FilterSummary,
  SMALL_BUTTON_CLASSNAME,
  TABLE_CELL_CLASSNAME,
  TABLE_CLASSNAME,
  TABLE_HEAD_CLASSNAME,
  TABLE_ROW_CLASSNAME,
  TOOLBAR_INPUT_CLASSNAME,
  TOOLBAR_SELECT_CLASSNAME,
  Toolbar,
  VIEW_CLASSNAME,
  Workspace,
  type ICrumb,
} from "./workspace";
import { EngineForm } from "./connection/EngineForm";
import type { ConnectionMethod } from "./connection/ConnectionMethod";
import { SourceDetail } from "./SourceDetail";
import { SchemaBrowser } from "./schema/SchemaBrowser";

const ENGINES = Object.keys(ENGINE_SPECS) as DataSourceKind[];

const KEEP_VERBATIM: readonly ConnectionFieldKind[] = ["password", "token"];

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

  const [query, setQuery] = useState("");
  const [engine, setEngine] = useState<DataSourceKind | "">("");
  const [openedId, setOpenedId] = useState<string | null>(null);
  const [layout, setLayout] = useState<"table" | "cards">("cards");

  const [formOpen, setFormOpen] = useState(false);
  const [kind, setKind] = useState<DataSourceKind>("postgres");
  const [name, setName] = useState("");
  const [method, setMethod] = useState<ConnectionMethod>("fields");
  const [connectionUrl, setConnectionUrl] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [readOnly, setReadOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [testState, setTestState] = useState<TestState>({ status: "idle" });

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
  function resetConnection(next: {
    kind: DataSourceKind;
    method: ConnectionMethod;
  }): void {
    setKind(next.kind);
    setMethod(next.method);
    setValues({});
    setConnectionUrl("");
    setFormError(null);
    setTestState({ status: "idle" });
  }

  function chooseEngine(next: DataSourceKind): void {
    const acceptsUrl = ENGINE_SPECS[next].acceptsConnectionUrl;
    resetConnection({
      kind: next,
      method: acceptsUrl ? "fields" : "url",
    });
  }

  function openForm(): void {
    setName("");
    setReadOnly(false);
    resetConnection({ kind: "postgres", method: "fields" });
    setFormOpen(true);
  }

  function connectionPayload(): ICreateDataSourceRequest | null {
    const body: ICreateDataSourceRequest = {
      kind,
      name: name.trim().length === 0 ? "connection test" : name.trim(),
      readOnly,
    };
    if (method === "url") {
      body.connectionUrl = connectionUrl.trim();
      return body;
    }
    type ITextField = Exclude<ConnectionFieldKind, "port" | "connectionMode">;
    const connection: Partial<Record<ITextField, string>> = {};
    for (const field of ENGINE_SPECS[kind].fields) {
      if (field.kind === "port" || field.kind === "connectionMode") {
        continue;
      }
      const raw = values[field.kind] ?? "";
      const value = KEEP_VERBATIM.includes(field.kind) ? raw : raw.trim();
      if (value.length > 0) {
        connection[field.kind] = value;
      }
    }

    const port = (values.port ?? "").trim();
    if (port.length > 0) {
      const parsed = Number(port);
      if (!Number.isInteger(parsed) || parsed < PORT_MIN || parsed > PORT_MAX) {
        return null;
      }
      body.port = parsed;
    }

    return { ...body, ...connection };
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    if (name.trim().length === 0) {
      setFormError("A name is required");
      return;
    }
    const payload = connectionPayload();
    if (payload === null) {
      setFormError(`The port must be a whole number between ${PORT_MIN} and ${PORT_MAX}`);
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
    const payload = connectionPayload();
    if (payload === null) {
      setTestState({
        status: "failed",
        message: `The port must be a whole number between ${PORT_MIN} and ${PORT_MAX}`,
      });
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

  const term = query.trim().toLowerCase();
  const visible = sources.filter((source) => {
    if (engine !== "" && source.kind !== engine) {
      return false;
    }
    if (term === "") {
      return true;
    }
    return `${source.name} ${targetOf(source)}`.toLowerCase().includes(term);
  });
  const filtering = term !== "" || engine !== "";

  if (opened !== null) {
    if (opened.kind !== "postgres") {
      return (
        <section className={VIEW_CLASSNAME}>
          <SourceDetail
            source={opened}
            onBack={() => setOpenedId(null)}
            onRemoved={() => {
              setOpenedId(null);
              void reload();
            }}
          />
        </section>
      );
    }
    return (
      <section className={VIEW_CLASSNAME}>
        <SchemaBrowser
          source={opened}
          sources={sources}
          onTrail={onTrail}
          onOpenSource={setOpenedId}
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
            <SourceDetail
              source={target}
              onBack={back}
              onRemoved={() => {
                setOpenedId(null);
                void reload();
              }}
            />
          )}
        />
      </section>
    );
  }

  return (
    <section className={VIEW_CLASSNAME}>
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span className="ml-auto font-mono text-[10px] text-muted-foreground">
          {sources.length} connected
        </span>
      </div>

      <Toolbar>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search sources…"
          aria-label="Search sources"
          className={cn("w-56", TOOLBAR_INPUT_CLASSNAME)}
        />
        <select
          value={engine}
          onChange={(event) =>
            setEngine(event.target.value as DataSourceKind | "")
          }
          aria-label="Filter by engine"
          className={TOOLBAR_SELECT_CLASSNAME}
        >
          <option value="">All engines</option>
          {ENGINES.map((option) => (
            <option key={option} value={option}>
              {ENGINE_SPECS[option].name}
            </option>
          ))}
        </select>
        <div
          className="flex items-center border border-border"
          role="group"
          aria-label="Change layout"
        >
          <button
            type="button"
            title="Table"
            aria-pressed={layout === "table"}
            onClick={() => setLayout("table")}
            className={
              layout === "table"
                ? "flex h-8 w-8 items-center justify-center bg-cyan/10 text-cyan"
                : "flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-fg"
            }
          >
            <span className="material-symbols-outlined text-[18px]">
              view_list
            </span>
          </button>
          <button
            type="button"
            title="Cards"
            aria-pressed={layout === "cards"}
            onClick={() => setLayout("cards")}
            className={
              layout === "cards"
                ? "flex h-8 w-8 items-center justify-center bg-cyan/10 text-cyan"
                : "flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-fg"
            }
          >
            <span className="material-symbols-outlined text-[18px]">
              grid_view
            </span>
          </button>
        </div>
        <Button
          className="ml-auto h-9 gap-1.5 border-transparent bg-cyan px-4 text-sm font-semibold text-black hover:bg-cyan/85 hover:text-black"
          onClick={openForm}
        >
          <IconPlus size={16} />
          Add source
        </Button>
      </Toolbar>

      {filtering ? (
        <FilterSummary
          count={visible.length}
          onClear={() => {
            setQuery("");
            setEngine("");
          }}
        />
      ) : null}

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
            ) : visible.length === 0 ? (
              <EmptyState
                title="Nothing matches"
                body="No source matches the current search and engine filter."
              />
            ) : layout === "cards" ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {visible.map((source) => (
                  <li key={source.id}>
                    <button
                      type="button"
                      onClick={() => setOpenedId(source.id)}
                      className="flex min-h-36 w-full flex-col justify-center gap-3 border border-border bg-card/30 p-6 text-left transition-colors hover:border-cyan/40"
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
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <table className={TABLE_CLASSNAME} aria-label="Data sources">
                <thead>
                  <tr>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      Source
                    </th>
                    <th scope="col" className={TABLE_HEAD_CLASSNAME}>
                      Target
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((source) => (
                    <tr key={source.id} className={TABLE_ROW_CLASSNAME}>
                      <td className={TABLE_CELL_CLASSNAME}>
                        <Button
                          variant="ghost"
                          onClick={() => setOpenedId(source.id)}
                          className="h-auto justify-start gap-2 px-1 py-0.5 text-xs"
                        >
                          <EngineIcon name={source.kind} className="size-4" />
                          <span className="truncate">{source.name}</span>
                        </Button>
                      </td>
                      <td
                        className={cn(
                          TABLE_CELL_CLASSNAME,
                          "truncate font-mono text-muted-foreground",
                        )}
                      >
                        {targetOf(source)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        }
      />

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg gap-5 rounded-none border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">Add a data source</DialogTitle>
          </DialogHeader>

          <form className="grid gap-4" onSubmit={submit}>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-muted-foreground">Engine</span>
              <select
                value={kind}
                onChange={(event) => chooseEngine(event.target.value as DataSourceKind)}
                className="h-10 rounded-md border border-input bg-background px-3 font-mono text-sm text-foreground"
              >
                {ENGINES.map((option) => (
                  <option key={option} value={option}>
                    {ENGINE_SPECS[option].name}
                  </option>
                ))}
              </select>
            </label>

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

            <EngineForm
              kind={kind}
              method={method}
              url={connectionUrl}
              values={values}
              onMethodChange={(next) => resetConnection({ kind, method: next })}
              onUrlChange={setConnectionUrl}
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
              <span className="text-xs text-muted-foreground">
                Read-only
                <span className="text-[10px]"> — limit this source to reads</span>
              </span>
            </label>

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
    </section>
  );
}
