import { and, eq } from "drizzle-orm";
import { schema } from "@heptadec/db";
import type { IOrganizationScope } from "../../common/session/current-organization";
import { logDriverFailure } from "../../common/driver-error";
import { providerSpec } from "./catalog";
import { baseUrlFor } from "./transport";

const { aiProvider } = schema;

const REQUEST_TIMEOUT_MS = 20_000;

const MAX_MODELS = 500;

export interface IModel {
  id: string;
  label: string | null;
}

export interface IModelConfig {
  provider: string;
  baseUrl: string | null;
  apiKey: string;
}

export type ModelListing =
  | { kind: "models"; models: IModel[] }
  | { kind: "unsupported" }
  | { kind: "refused" }
  | { kind: "unreachable" };

export async function listModels(config: IModelConfig): Promise<ModelListing> {
  const spec = providerSpec(config.provider);
  if (spec === null) {
    return { kind: "refused" };
  }
  const baseUrl = baseUrlFor(spec, config.baseUrl);
  if (baseUrl === null) {
    return { kind: "refused" };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
      method: "GET",
      headers: { authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (caught) {
    // The listing answers with a status; the operator gets the driver's own
    // words, which is the half this catch used to drop.
    logDriverFailure(caught, "reach that provider");
    return { kind: "unreachable" };
  }

  if (response.status === 401 || response.status === 403) {
    return { kind: "refused" };
  }
  if (response.status === 404 || response.status === 405) {
    return { kind: "unsupported" };
  }
  if (!response.ok) {
    return { kind: "unreachable" };
  }

  const payload: unknown = await response.json();
  if (typeof payload !== "object" || payload === null) {
    return { kind: "unsupported" };
  }
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) {
    return { kind: "unsupported" };
  }

  const models: IModel[] = [];
  for (const entry of data) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const id = (entry as { id?: unknown }).id;
    if (typeof id !== "string" || id === "") {
      continue;
    }
    const label = (entry as { name?: unknown }).name;
    models.push({
      id,
      label: typeof label === "string" && label !== id ? label : null,
    });
    if (models.length >= MAX_MODELS) {
      break;
    }
  }

  return models.length === 0 ? { kind: "unsupported" } : { kind: "models", models };
}

export async function suggestModels(
  organization: IOrganizationScope,
  providerId: string,
): Promise<IModel[]> {
  const rows = await organization.db
    .select({ model: aiProvider.model })
    .from(aiProvider)
    .where(
      and(
        organization.where(aiProvider.organizationId),
        eq(aiProvider.provider, providerId),
      ),
    )
    .groupBy(aiProvider.model)
    .limit(5);
  return rows.map((row) => ({ id: row.model, label: null }));
}
