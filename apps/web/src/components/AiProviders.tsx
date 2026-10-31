import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconTrash } from "@tabler/icons-react";
import type {
  IAiModel,
  IAiProvider,
  IAiProviderListResponse,
  IListModelsResponse,
} from "@heptadec/api/ai-contracts";
import {
  createAiProvider,
  updateAiProvider,
  listAiProviders,
  listProviderModels,
  messageFor,
  removeAiProvider,
} from "../api";
import { Button } from "./ui/button";
import { Alert, EmptyState } from "./ui/feedback";
import { FieldGroup, FieldLabel } from "./ui/field";
import { Input } from "./ui/input";
import { SearchableSelect } from "./ui/searchable-select";
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

const NO_CATALOG: Catalog = [];

export function AiProviders({ isOwner }: { isOwner: boolean }) {
  const queryClient = useQueryClient();
  const listed = useQuery({
    queryKey: ["ai-providers"],
    queryFn: listAiProviders,
    enabled: isOwner,
  });
  const providers = listed.data?.providers ?? [];
  const catalog = listed.data?.catalog ?? NO_CATALOG;

  const [notice, setNotice] = useState<string | null>(null);

  const [provider, setProvider] = useState("");
  const [name, setName] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [models, setModels] = useState<IAiModel[] | null>(null);
  const [modelSource, setModelSource] = useState<
    "provider" | "suggestions" | null
  >(null);
  const [modelsNote, setModelsNote] = useState<string | null>(null);
  const [loadingDraft, setLoadingDraft] = useState(false);

  function applyListing(listedModels: IListModelsResponse): void {
    setModels(listedModels.models);
    setModelSource(listedModels.source);
    if (listedModels.source === "provider") {
      setModel(listedModels.models[0]?.id ?? "");
      setModelsNote(`${listedModels.models.length} models this key can reach`);
      return;
    }
    setModelsNote("That provider does not publish a model list — type the model id");
  }

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
    setBaseUrl("");
    setModels(null);
    setModelSource(null);
    setModelsNote(null);
    setModel("");
    const spec = catalog.find((entry) => entry.id === next);
    if (spec?.models && spec.models.length > 0) {
      const listedModels = spec.models.map((entry) => ({
        id: entry.id,
        label: entry.label,
      }));
      setModels(listedModels);
      setModelSource("provider");
      setModel(listedModels[0]?.id ?? "");
      setModelsNote(`${listedModels.length} models`);
      return;
    }
    if (spec !== undefined && !spec.needsBaseUrl && apiKey.trim() !== "") {
      void loadDraftModels(next, "");
    }
  }

  function clearForm(): void {
    setName("");
    setProvider("");
    setModel("");
    setApiKey("");
    setBaseUrl("");
    setIsDefault(false);
    setEditingId(null);
    setModels(null);
    setModelSource(null);
    setModelsNote(null);
  }

  const save = useMutation({
    mutationFn: () =>
      editingId === null
        ? createAiProvider({
            name,
            provider,
            model,
            apiKey,
            isDefault,
            ...(baseUrl === "" ? {} : { baseUrl }),
          })
        : updateAiProvider({
            id: editingId,
            name,
            provider,
            model,
            apiKey,
            isDefault,
            ...(baseUrl === "" ? {} : { baseUrl }),
          }),
    onSuccess: () => {
      setNotice(editingId === null ? "That provider was saved." : "That provider was updated.");
      clearForm();
      queryClient.invalidateQueries({ queryKey: ["ai-providers"] });
    },
  });

  const remove = useMutation({
    mutationFn: (providerId: string) => removeAiProvider(providerId),
    onSuccess: () => {
      setNotice("That provider was removed.");
      queryClient.invalidateQueries({ queryKey: ["ai-providers"] });
    },
  });

  const makeCurrent = useMutation({
    mutationFn: (providerId: string) =>
      updateAiProvider({ id: providerId, isDefault: true }),
    onSuccess: () => {
      setNotice("That provider is now in use.");
      queryClient.invalidateQueries({ queryKey: ["ai-providers"] });
    },
  });

  function edit(target: IAiProvider): void {
    setName(target.name);
    setProvider(target.provider);
    setModel(target.model);
    setBaseUrl(target.baseUrl ?? "");
    setApiKey("");
    setIsDefault(target.isDefault);
    setEditingId(target.id);
    setModels(null);
    setModelSource(null);
    setModelsNote("Keep this model id, or type another");
  }

  const loadProblem = listed.isError
    ? messageFor(listed.error, "The AI providers could not be loaded.")
    : null;
  const saveProblem = save.isError
    ? messageFor(save.error, "That provider could not be saved.")
    : null;
  const removeProblem = remove.isError
    ? messageFor(remove.error, "That provider could not be removed.")
    : null;
  const currentProblem = makeCurrent.isError
    ? messageFor(makeCurrent.error, "That provider could not be selected.")
    : null;

  const chosenSpec = catalog.find((entry) => entry.id === provider);
  const saveBlocked =
    save.isPending ||
    provider === "" ||
    name.trim() === "" ||
    model.trim() === "" ||
    (editingId === null && apiKey.trim() === "") ||
    (chosenSpec?.needsBaseUrl === true && baseUrl.trim() === "");
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
          {loadProblem ? (
            <div className="px-6 pb-2">
              <Alert>{loadProblem}</Alert>
            </div>
          ) : null}
          {saveProblem ? (
            <div className="px-6 pb-2">
              <Alert>{saveProblem}</Alert>
            </div>
          ) : null}
          {removeProblem ? (
            <div className="px-6 pb-2">
              <Alert>{removeProblem}</Alert>
            </div>
          ) : null}
          {currentProblem ? (
            <div className="px-6 pb-2">
              <Alert>{currentProblem}</Alert>
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
                <FieldLabel htmlFor="ai-name">Name</FieldLabel>
                <Input
                  id="ai-name"
                  value={name}
                  placeholder="team key"
                  onChange={(event) => setName(event.target.value)}
                />
              </FieldGroup>
              <FieldGroup>
                <FieldLabel htmlFor="ai-provider">Provider</FieldLabel>
                <SearchableSelect
                  options={catalog.map((entry) => ({
                    value: entry.id,
                    label: entry.label,
                  }))}
                  value={provider}
                  onValueChange={chooseProvider}
                  placeholder="Choose a provider"
                />
              </FieldGroup>
              <FieldGroup>
                <FieldLabel htmlFor="ai-model">Model</FieldLabel>
                {modelSource === "provider" && models !== null ? (
                  <SearchableSelect
                    options={models.map((entry) => ({
                      value: entry.id,
                      label: entry.label === null ? entry.id : `${entry.label} · ${entry.id}`,
                    }))}
                    value={model}
                    onValueChange={setModel}
                    placeholder="Choose a model"
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
              Use this provider for questions
            </label>

            <div>
              <Button
                disabled={saveBlocked}
                onClick={() => save.mutate()}
              >
                Save provider
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-6 py-3">
            {listed.isPending ? (
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
                    <th className={TABLE_CELL_CLASSNAME}>In use</th>
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
                        {entry.isDefault ? "Yes" : ""}
                      </td>
                      <td className={`${TABLE_CELL_CLASSNAME} text-right`}>
                        {entry.isDefault ? null : (
                          <Button
                            variant="ghost"
                            className={SMALL_BUTTON_CLASSNAME}
                            disabled={makeCurrent.isPending}
                            onClick={() => makeCurrent.mutate(entry.id)}
                          >
                            Use
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          className={SMALL_BUTTON_CLASSNAME}
                          disabled={remove.isPending}
                          onClick={() => edit(entry)}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          className={`${SMALL_BUTTON_CLASSNAME} text-red`}
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(entry.id)}
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
