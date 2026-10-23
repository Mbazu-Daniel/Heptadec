import { useCallback, useEffect, useState } from "react";
import { IconTrash } from "@tabler/icons-react";
import type {
  IAiModel,
  IAiProvider,
  IAiProviderListResponse,
  IListModelsResponse,
} from "@heptadec/api/ai-contracts";
import {
  createAiProvider,
  listAiProviderModels,
  listAiProviders,
  listProviderModels,
  messageFor,
  removeAiProvider,
} from "../api";
import { Button } from "./ui/button";
import { Alert, EmptyState } from "./ui/feedback";
import { FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { Select } from "./ui/select";
import {
  SMALL_BUTTON_CLASSNAME,
  TABLE_CELL_CLASSNAME,
  TABLE_CLASSNAME,
  TABLE_HEAD_CLASSNAME,
  TABLE_ROW_CLASSNAME,
  VIEW_CLASSNAME,
  Workspace,
} from "./workspace";

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
  const [modelSource, setModelSource] = useState<
    "provider" | "suggestions" | null
  >(null);
  const [modelsNote, setModelsNote] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);

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

  function applyListing(listed: IListModelsResponse): void {
    setModels(listed.models);
    setModelSource(listed.source);
    if (listed.source === "provider") {
      setModel(listed.models[0]?.id ?? "");
      setModelsNote(`${listed.models.length} models this key can reach`);
      return;
    }
    setModelsNote("That provider does not publish a model list — type the model id");
  }

  async function loadModels(target: IAiProvider): Promise<void> {
    setLoadingModels(true);
    setModelsNote(null);
    try {
      applyListing(await listAiProviderModels(target.id));
    } catch (caught) {
      setModels(null);
      setModelSource("suggestions");
      setModelsNote(messageFor(caught, "The model list could not be read."));
    } finally {
      setLoadingModels(false);
    }
  }

  /**
   * Lists a provider's models before it is saved, so the form can offer a
   * dropdown instead of asking for a model id from memory.
   */
  async function loadDraftModels(
    targetProvider: string,
    targetBaseUrl: string,
  ): Promise<void> {
    const spec = catalog.find((entry) => entry.id === targetProvider);
    if (
      spec === undefined ||
      apiKey.trim() === "" ||
      (spec.needsBaseUrl && targetBaseUrl.trim() === "")
    ) {
      return;
    }
    setLoadingDraft(true);
    setModelsNote(null);
    try {
      applyListing(
        await listProviderModels({
          provider: targetProvider,
          apiKey,
          ...(targetBaseUrl === "" ? {} : { baseUrl: targetBaseUrl }),
        }),
      );
    } catch (caught) {
      setModels(null);
      setModelSource("suggestions");
      setModelsNote(messageFor(caught, "The model list could not be read."));
    } finally {
      setLoadingDraft(false);
    }
  }

  function chooseProvider(next: string): void {
    setProvider(next);
    setModels(null);
    setModelSource(null);
    setModelsNote(null);
    setModel("");
    const spec = catalog.find((entry) => entry.id === next);
    if (spec !== undefined && !spec.needsBaseUrl && apiKey.trim() !== "") {
      void loadDraftModels(next, "");
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
  const modelHint =
    provider === ""
      ? "Choose a provider first"
      : apiKey.trim() === ""
        ? "Add the key, then leave the field to load this provider's models"
        : chosenSpec?.needsBaseUrl === true && baseUrl.trim() === ""
          ? "Add the base URL, then leave the field to load this provider's models"
          : null;
  const modelMessage = loadingDraft
    ? "Reading the model list…"
    : (modelsNote ?? modelHint);

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
                <Select
                  options={catalog.map((entry) => ({
                    value: entry.id,
                    label: entry.label,
                  }))}
                  value={provider === "" ? null : provider}
                  onValueChange={(next) => {
                    chooseProvider(next ?? "");
                  }}
                  placeholder="Choose a provider"
                  clearable={false}
                />
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
                {modelSource === "provider" && models !== null ? (
                  <Select
                    options={models.map((entry) => ({
                      value: entry.id,
                      label:
                        entry.label === null
                          ? entry.id
                          : `${entry.label} · ${entry.id}`,
                    }))}
                    value={model === "" ? null : model}
                    onValueChange={(next) => {
                      setModel(next ?? "");
                    }}
                    placeholder="Choose a model"
                    clearable={false}
                  />
                ) : (
                  <Input
                    id="ai-model"
                    value={model}
                    list="ai-model-suggestions"
                    placeholder="model id"
                    onChange={(event) => setModel(event.target.value)}
                  />
                )}
                <datalist id="ai-model-suggestions">
                  {(models ?? []).map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label ?? ""}
                    </option>
                  ))}
                </datalist>
                {modelMessage === null ? null : (
                  <span className="text-[12px] text-muted-foreground">
                    {modelMessage}
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
                  onBlur={() => void loadDraftModels(provider, baseUrl)}
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
                    onBlur={() => void loadDraftModels(provider, baseUrl)}
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
