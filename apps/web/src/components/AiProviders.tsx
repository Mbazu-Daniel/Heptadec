import { useCallback, useEffect, useState } from "react";
import { IconTrash } from "@tabler/icons-react";
import type {
  IAiModel,
  IAiProvider,
  IAiProviderListResponse,
} from "@heptadec/api/ai-contracts";
import {
  createAiProvider,
  listAiProviderModels,
  listAiProviders,
  messageFor,
  removeAiProvider,
} from "../api";
import { Button } from "./ui/button";
import { Alert, EmptyState } from "./ui/feedback";
import { FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import {
  SMALL_BUTTON_CLASSNAME,
  TABLE_CELL_CLASSNAME,
  TABLE_CLASSNAME,
  TABLE_HEAD_CLASSNAME,
  TABLE_ROW_CLASSNAME,
  VIEW_CLASSNAME,
  Workspace,
} from "./workspace";

const SELECT_CLASSNAME =
  "h-7 rounded-md border border-input bg-background px-2 font-mono text-xs text-foreground";

type Catalog = IAiProviderListResponse["catalog"];

export function AiProviders({ isOwner }: { isOwner: boolean }) {
  const [providers, setProviders] = useState<IAiProvider[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [provider, setProvider] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [models, setModels] = useState<IAiModel[] | null>(null);
  const [modelsNote, setModelsNote] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  const reload = useCallback(async () => {
    if (!isOwner) {
      return;
    }
    setProblem(null);
    try {
      const listed = await listAiProviders();
      setProviders(listed.providers);
      setCatalog(listed.catalog);
    } catch (caught) {
      setProblem(messageFor(caught, "The AI providers could not be loaded."));
    }
  }, [isOwner]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (provider === "") {
      return;
    }
    const spec = catalog.find((entry) => entry.id === provider);
    if (spec?.needsBaseUrl === true) {
      setBaseUrl("");
    }
  }, [provider, catalog]);

  async function loadModels(target: IAiProvider): Promise<void> {
    setLoadingModels(true);
    setModelsNote(null);
    try {
      const listed = await listAiProviderModels(target.id);
      setModels(listed.models);
      setModelsNote(
        listed.source === "provider"
          ? `${listed.models.length} models this key can reach`
          : "That provider does not publish a model list — type the model id",
      );
      setModel(listed.models[0]?.id ?? target.model);
    } catch (caught) {
      setModels([]);
      setModelsNote(messageFor(caught, "The model list could not be read."));
    } finally {
      setLoadingModels(false);
    }
  }

  async function save(): Promise<void> {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await createAiProvider({
        name,
        provider,
        model,
        apiKey,
        isDefault,
        ...(baseUrl === "" ? {} : { baseUrl }),
      });
      setName("");
      setApiKey("");
      setIsDefault(false);
      await reload();
      setNotice("That provider was saved.");
    } catch (caught) {
      setProblem(messageFor(caught, "That provider could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function remove(providerId: string): Promise<void> {
    setBusy(true);
    setProblem(null);
    setNotice(null);
    try {
      await removeAiProvider(providerId);
      await reload();
      setNotice("That provider was removed.");
    } catch (caught) {
      setProblem(messageFor(caught, "That provider could not be removed."));
    } finally {
      setBusy(false);
    }
  }

  const chosenSpec = catalog.find((entry) => entry.id === provider);

  if (!isOwner) {
    return (
      <Workspace
        view={
          <div className={VIEW_CLASSNAME}>
            <EmptyState
              title="Owners only"
              body="AI providers are managed by an owner of this organization."
            />
          </div>
        }
      />
    );
  }

  return (
    <Workspace
      view={
        <div className="flex min-h-0 flex-1 flex-col pt-6">
          {problem ? (
            <div className="px-6 pb-2">
              <Alert>{problem}</Alert>
            </div>
          ) : null}
          {notice ? (
            <div className="px-6 pb-2">
              <Alert tone="success">{notice}</Alert>
            </div>
          ) : null}

          <div className="grid gap-3 border-b border-border px-6 pb-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldGroup>
                <FieldLabel htmlFor="ai-provider">Provider</FieldLabel>
                <select
                  id="ai-provider"
                  className={SELECT_CLASSNAME}
                  value={provider}
                  onChange={(event) => setProvider(event.target.value)}
                >
                  <option value="">Choose a provider</option>
                  {catalog.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup>
                <FieldLabel htmlFor="ai-name">Name</FieldLabel>
                <Input
                  id="ai-name"
                  value={name}
                  placeholder="team key"
                  onChange={(event) => setName(event.target.value)}
                />
              </FieldGroup>
              <FieldGroup>
                <FieldLabel htmlFor="ai-model">Model</FieldLabel>
                <Input
                  id="ai-model"
                  value={model}
                  list="ai-model-suggestions"
                  placeholder="model id"
                  onChange={(event) => setModel(event.target.value)}
                />
                <datalist id="ai-model-suggestions">
                  {(models ?? []).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label ?? ""}
                    </option>
                  ))}
                </datalist>
                {modelsNote === null ? null : (
                  <span className="text-[11px] text-muted-foreground">
                    {modelsNote}
                  </span>
                )}
              </FieldGroup>
              <FieldGroup>
                <FieldLabel htmlFor="ai-key">API key</FieldLabel>
                <Input
                  id="ai-key"
                  type="password"
                  value={apiKey}
                  placeholder="sk-…"
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </FieldGroup>
              {chosenSpec?.needsBaseUrl === true ? (
                <FieldGroup>
                  <FieldLabel htmlFor="ai-base">Base URL</FieldLabel>
                  <Input
                    id="ai-base"
                    value={baseUrl}
                    placeholder={chosenSpec?.exampleBaseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                  />
                </FieldGroup>
              ) : null}
            </div>

            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(event) => setIsDefault(event.target.checked)}
              />
              Use this one by default
            </label>

            <div>
              <Button
                disabled={busy || provider === "" || name.trim() === "" || model.trim() === "" || apiKey.trim() === ""}
                onClick={() => void save()}
              >
                Save provider
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-3">
            {providers === null ? (
              <p className="text-xs text-muted-foreground">Loading</p>
            ) : providers.length === 0 ? (
              <EmptyState
                title="No providers yet"
                body="Add one above, then ask questions from a Postgres source."
              />
            ) : (
              <table className={TABLE_CLASSNAME}>
                <thead className={TABLE_HEAD_CLASSNAME}>
                  <tr>
                    <th className={TABLE_CELL_CLASSNAME}>Name</th>
                    <th className={TABLE_CELL_CLASSNAME}>Provider</th>
                    <th className={TABLE_CELL_CLASSNAME}>Model</th>
                    <th className={TABLE_CELL_CLASSNAME}>Default</th>
                    <th className={TABLE_CELL_CLASSNAME} />
                  </tr>
                </thead>
                <tbody>
                  {providers.map((entry) => (
                    <tr key={entry.id} className={TABLE_ROW_CLASSNAME}>
                      <td className={TABLE_CELL_CLASSNAME}>{entry.name}</td>
                      <td className={TABLE_CELL_CLASSNAME}>
                        {entry.providerLabel}
                      </td>
                      <td className={TABLE_CELL_CLASSNAME}>{entry.model}</td>
                      <td className={TABLE_CELL_CLASSNAME}>
                        {entry.isDefault ? "yes" : ""}
                      </td>
                      <td className={`${TABLE_CELL_CLASSNAME} text-right`}>
                        <Button
                          variant="ghost"
                          className={SMALL_BUTTON_CLASSNAME}
                          disabled={busy || loadingModels}
                          onClick={() => void loadModels(entry)}
                        >
                          {loadingModels ? "Reading…" : "Models"}
                        </Button>
                        <Button
                          variant="ghost"
                          className={`${SMALL_BUTTON_CLASSNAME} text-red`}
                          disabled={busy}
                          onClick={() => void remove(entry.id)}
                        >
                          <IconTrash size={14} strokeWidth={1.5} />
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      }
    />
  );
}
