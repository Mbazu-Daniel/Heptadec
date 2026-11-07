import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions/index";
import {
  readBody,
  readOptionalString,
  readString,
} from "../../common/http/body";
import { streamTurn } from "../../common/http/stream";
import { can } from "../rbac/authorize";
import { requireOwner } from "../rbac/owner";
import { recordAudit } from "../audit/index";
import { ANSWER_EVENTS } from "./contracts";
import { dataSource } from "@heptadec/db";
import { chosenProvider } from "./provider";
import {
  ask,
  createProvider,
  deleteProvider,
  draftModels,
  listProviders,
  providerModels,
} from "./ai.service";

const MAX_NAME = 60;

const MAX_MODEL = 120;

const MAX_QUESTION = 2_000;

export async function listProvidersHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  requireOwner(c, "Only owners can manage AI providers");
  return c.json(await listProviders(organization));
}

export async function createProviderHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  requireOwner(c, "Only owners can manage AI providers");

  const payload = readBody(await c.req.json(), "A provider is required");
  const created = await createProvider(organization, {
    name: readString(payload, "name", "Give the provider a name", MAX_NAME),
    provider: readString(payload, "provider", "Choose a provider", 40),
    model: readString(payload, "model", "Name the model to use", MAX_MODEL),
    apiKey: readString(payload, "apiKey", "Paste the provider's API key", 400),
    baseUrl: readOptionalString(
      payload,
      "baseUrl",
      "That provider needs a base URL",
      200,
    ),
    isDefault: payload.isDefault === true,
  });

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "ai_provider.created",
    targetKind: "ai_provider",
    targetId: created.id,
    targetLabel: created.name,
    detail: `${created.providerLabel} · ${created.model}`,
  });

  return c.json(created, 201);
}

export async function deleteProviderHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/ai/providers/:id">,
) {
  const organization = activeOrganization(c);
  requireOwner(c, "Only owners can manage AI providers");

  const removed = await deleteProvider(organization, c.req.param("id"));

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "ai_provider.deleted",
    targetKind: "ai_provider",
    targetId: removed.id,
    targetLabel: removed.name,
  });

  return c.json({ removed: removed.id });
}

export async function providerModelsHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/ai/providers/:id/models">,
) {
  const organization = activeOrganization(c);
  requireOwner(c, "Only owners can manage AI providers");
  return c.json(await providerModels(organization, c.req.param("id")));
}

export async function draftModelsHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  requireOwner(c, "Only owners can manage AI providers");

  const payload = readBody(await c.req.json(), "A provider is required");

  return c.json(
    await draftModels(organization, {
      provider: readString(payload, "provider", "Choose a provider", 40),
      apiKey: readString(payload, "apiKey", "Paste the provider's API key", 400),
      baseUrl: readOptionalString(
        payload,
        "baseUrl",
        "That provider needs a base URL",
        200,
      ),
    }),
  );
}

export async function askHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "query", "create"))) {
    throw new ForbiddenException("Only owners and editors can ask questions");
  }

  const payload = readBody(await c.req.json(), "A question is required");
  const question = readString(
    payload,
    "question",
    "Ask the question in words",
    MAX_QUESTION,
  );
  const dataSourceIds = optionalIdList(payload, "dataSourceIds");

  if (dataSourceIds.length > 0) {
    const owned = await organization.db
      .select({ id: dataSource.id })
      .from(dataSource)
      .where(organization.where(dataSource.organizationId));
    const ownedIds = new Set(owned.map((row) => row.id));
    if (dataSourceIds.some((id) => !ownedIds.has(id))) {
      throw new NotFoundException("That data source does not exist");
    }
  }
  if ((await chosenProvider(organization, payload.providerId)) === null) {
    throw new BadRequestException(
      "No AI provider is set up for this organization yet",
    );
  }

  return streamTurn(
    c,
    ANSWER_EVENTS,
    {
      log: "[ai] that question could not be answered:",
      message:
        "That source could not be read, or the provider could not be reached. Check the source and the key.",
    },
    async (turn) => {
      await ask(
        organization,
        { question, providerId: payload.providerId, dataSourceIds },
        turn,
      );
    },
  );
}

const optionalIdList = (
  payload: Record<string, unknown>,
  field: string,
): string[] => {
  const value = payload[field];
  if (!Array.isArray(value)) {
    return [];
  }
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0 || entry.length > 64) {
      throw new BadRequestException("That data source id is not valid");
    }
  }
  return value as string[];
};
