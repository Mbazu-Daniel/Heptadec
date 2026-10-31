import { and, eq } from "drizzle-orm";
import {
  aiProvider,
  type HeptadecDatabase,
} from "@heptadec/db";
import type { IOrganizationScope } from "../../common/session/current-organization";
import { isJsonObject } from "../../common/http/body";
import { logDriverFailure } from "../../common/driver-error";
import { providerEndpointFor } from "./transport";

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
  let baseUrl: string;
  try {
    baseUrl = providerEndpointFor(config.provider, config.baseUrl).baseUrl;
  } catch {
    return { kind: "refused" };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      headers: { authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (caught) {
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
  if (!isJsonObject(payload)) {
    return { kind: "unsupported" };
  }
  const data = payload.data;
  if (!Array.isArray(data)) {
    return { kind: "unsupported" };
  }

  const models: IModel[] = [];
  for (const entry of data) {
    if (!isJsonObject(entry)) {
      continue;
    }
    const id = entry.id;
    if (typeof id !== "string" || id === "") {
      continue;
    }
    const label = entry.name;
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
