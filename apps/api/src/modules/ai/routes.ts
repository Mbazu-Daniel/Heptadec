import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import {
  schema,
  type AiProviderRow,
  type DataSourceRow,
} from "@heptadec/db";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  activeOrganization,
  oneRow,
  type IOrganizationScope,
} from "../../common/session/current-organization";
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions";
import { driverFailure } from "../../common/driver-error";
import { readBody, readString, readStringOrKeep } from "../../common/http/body";
import { can } from "../rbac/authorize";
import { requireOwner } from "../rbac/owner";
import { recordAudit } from "../audit";
import { encryptSecret, decryptSecret } from "../data-source/secret";
import { canBeAsked, engineOf } from "../data-source/engines";
import { AI_PROVIDERS, providerSpec, type IAiProviderSpec } from "./catalog";
import { baseUrlFor, speaksProtocol } from "./transport";
import { askStyleOf } from "./ask";
import { streamQuery } from "./generate";
import { routeInstructions } from "./instructions";
import { chosenProvider } from "./provider";
import {
  listModels,
  suggestModels,
  type IModelConfig,
  type ModelListing,
} from "./models";
import { runTurn } from "./turn";
import type {
  ICreateAiProviderResponse,
  IAiProviderListResponse,
  IDeleteAiProviderResponse,
  IGenerateQueryResponse,
  IListModelsResponse,
  IUpdateAiProviderResponse,
} from "./contracts";

const { aiProvider, aiChat, dataSource } = schema;

const MAX_NAME = 60;

const MAX_MODEL = 120;

const MAX_QUESTION = 2_000;

export function aiRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/ai/providers", requireSession, async (c) => {
    const organization = activeOrganization(c);
    requireOwner(c, "Only owners can manage AI providers");

    const rows = await organization.db
      .select()
      .from(aiProvider)
      .where(organization.where(aiProvider.organizationId))
      .orderBy(aiProvider.createdAt);

    const body: IAiProviderListResponse = {
      providers: rows.map((row) => ({
        id: row.id,
        name: row.name,
        provider: row.provider,
        providerLabel: providerSpec(row.provider)?.label ?? row.provider,
        model: row.model,
        baseUrl: row.baseUrl,
        isDefault: row.isDefault,
        createdAt: row.createdAt.toISOString(),
      })),
      catalog: AI_PROVIDERS.filter(speaksProtocol),
    };
    return c.json(body);
  });

  routes.post("/api/ai/providers", requireSession, async (c) => {
    const organization = activeOrganization(c);
    requireOwner(c, "Only owners can manage AI providers");

    const payload = readBody(await c.req.json(), "A provider is required");
    const name = readString(payload, "name", "Give the provider a name", MAX_NAME);
    const provider = readString(payload, "provider", "Choose a provider", 40);
    const spec = providerSpec(provider);
    if (spec === null) {
      throw new BadRequestException("That provider is not one we know");
    }
    if (!speaksProtocol(spec)) {
      throw new BadRequestException(
        `${spec.label} is not supported yet — its API does not speak the protocol this app speaks`,
      );
    }
    const model = readString(payload, "model", "Name the model to use", MAX_MODEL);
    const apiKey = readString(payload, "apiKey", "Paste the provider's API key", 400);
    const isDefault = payload.isDefault === true;

    const baseUrl = providerBaseUrl(spec, payload, null);

    const now = new Date();
    const [row] = await organization.db.transaction(async (tx) => {
      if (isDefault) {
        await tx
          .update(aiProvider)
          .set({ isDefault: false, updatedAt: now })
          .where(
            and(
              organization.where(aiProvider.organizationId),
              eq(aiProvider.isDefault, true),
            ),
          );
      }
      return tx
        .insert(aiProvider)
        .values({
          organizationId: organization.organizationId,
          name,
          provider,
          model,
          baseUrl,
          apiKey: await encryptSecret(apiKey),
          isDefault,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    });

    if (row === undefined) {
      throw new NotFoundException("That provider could not be saved");
    }

    const body: ICreateAiProviderResponse = {
      id: row.id,
      name: row.name,
      provider: row.provider,
      providerLabel: spec.label,
      model: row.model,
      baseUrl: row.baseUrl,
      isDefault: row.isDefault,
      createdAt: row.createdAt.toISOString(),
    };

    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "ai_provider.created",
      targetKind: "ai_provider",
      targetId: row.id,
      targetLabel: row.name,
      detail: `${spec.label} · ${model}`,
    });

    return c.json(body, 201);
  });

  routes.delete("/api/ai/providers/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);
    requireOwner(c, "Only owners can manage AI providers");

    const found = await oneRow(organization.db, aiProvider, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That provider does not exist");
    }

    const removed = await organization.db
      .delete(aiProvider)
      .where(
        and(
          eq(aiProvider.id, found.id),
          organization.where(aiProvider.organizationId),
        ),
      )
      .returning({ id: aiProvider.id });

    if (removed.length > 0 && found.isDefault) {
      await promoteAnother(organization);
    }

    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "ai_provider.deleted",
      targetKind: "ai_provider",
      targetId: found.id,
      targetLabel: found.name,
    });

    const body: IDeleteAiProviderResponse = { removed: found.id };
    return c.json(body);
  });

  routes.patch("/api/ai/providers/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);
    requireOwner(c, "Only owners can manage AI providers");

    const found = await oneRow(organization.db, aiProvider, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That provider does not exist");
    }

    const payload = readBody(await c.req.json(), "A provider is required");

    const name = readStringOrKeep(payload, "name", found.name, "Give the provider a name", MAX_NAME);
    const provider = readStringOrKeep(payload, "provider", found.provider, "Choose a provider", 40);
    const spec = providerSpec(provider);
    if (spec === null) {
      throw new BadRequestException("That provider is not one we know");
    }
    if (!speaksProtocol(spec)) {
      throw new BadRequestException(
        `${spec.label} is not supported yet — its API does not speak the protocol this app speaks`,
      );
    }
    const model = readStringOrKeep(payload, "model", found.model, "Name the model to use", MAX_MODEL);
    const apiKey = readStringOrKeep(payload, "apiKey", "", "Paste the provider's API key", 400);
    const isDefault =
      typeof payload.isDefault === "boolean" ? payload.isDefault : found.isDefault;
    const baseUrl = providerBaseUrl(
      spec,
      payload,
      provider === found.provider ? found.baseUrl : null,
    );

    const now = new Date();
    await organization.db.transaction(async (tx) => {
      if (isDefault) {
        await tx
          .update(aiProvider)
          .set({ isDefault: false, updatedAt: now })
          .where(
            and(
              organization.where(aiProvider.organizationId),
              eq(aiProvider.isDefault, true),
            ),
          );
      }
      await tx
        .update(aiProvider)
        .set({
          name,
          provider,
          model,
          baseUrl,
          apiKey: apiKey === "" ? found.apiKey : await encryptSecret(apiKey),
          isDefault,
          updatedAt: now,
        })
        .where(
          and(eq(aiProvider.id, found.id), organization.where(aiProvider.organizationId)),
        );
    });

    const updated = await oneRow(organization.db, aiProvider, found.id, organization);
    if (updated === undefined) {
      throw new NotFoundException("That provider could not be read after update");
    }

    const body: IUpdateAiProviderResponse = {
      id: updated.id,
      name: updated.name,
      provider: updated.provider,
      providerLabel: spec.label,
      model: updated.model,
      baseUrl: updated.baseUrl,
      isDefault: updated.isDefault,
      createdAt: updated.createdAt.toISOString(),
    };

    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "ai_provider.updated",
      targetKind: "ai_provider",
      targetId: found.id,
      targetLabel: found.name,
      detail: `${spec.label} · ${model}`,
    });

    return c.json(body);
  });

  routes.get("/api/ai/providers/:id/models", requireSession, async (c) => {
    const organization = activeOrganization(c);
    requireOwner(c, "Only owners can manage AI providers");

    const found = await oneRow(organization.db, aiProvider, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That provider does not exist");
    }

    const listing = await listModels({
      provider: found.provider,
      baseUrl: found.baseUrl,
      apiKey: await decryptSecret(found.apiKey),
    });
    return c.json(await modelsAnswer(organization, found.provider, listing));
  });

  routes.post("/api/ai/providers/models", requireSession, async (c) => {
    const organization = activeOrganization(c);
    requireOwner(c, "Only owners can manage AI providers");

    const payload = readBody(await c.req.json(), "A provider is required");
    const provider = readString(payload, "provider", "Choose a provider", 40);
    const spec = providerSpec(provider);
    if (spec === null) {
      throw new BadRequestException("That provider is not one we know");
    }
    if (!speaksProtocol(spec)) {
      throw new BadRequestException(
        `${spec.label} is not supported yet — its API does not speak the protocol this app speaks`,
      );
    }
    const apiKey = readString(payload, "apiKey", "Paste the provider's API key", 400);
    const config: IModelConfig = {
      provider,
      baseUrl: providerBaseUrl(spec, payload, null),
      apiKey,
    };

    const listing = await listModels(config);
    return c.json(await modelsAnswer(organization, provider, listing));
  });

  routes.post("/api/ai/ask", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "query", "create"))) {
      throw new ForbiddenException("Only owners and editors can ask questions");
    }

    const payload = readBody(await c.req.json(), "A question is required");
    const question = readString(
      payload,
      "question",
      "Ask the question in words",
      MAX_QUESTION,
    );

    const wanted = optionalIdList(payload, "dataSourceIds");
    const owned = await organization.db
      .select()
      .from(dataSource)
      .where(organization.where(dataSource.organizationId))
      .orderBy(dataSource.createdAt);

    const scoped =
      wanted.length === 0
        ? owned
        : owned.filter((candidate) => wanted.includes(candidate.id));
    if (wanted.length > 0 && scoped.length !== wanted.length) {
      throw new NotFoundException("That data source does not exist");
    }

    const askable = scoped.filter(canBeAsked);
    if (askable.length === 0) {
      throw new BadRequestException(
        "None of those sources can be asked about — a command or search source has no queryable structure",
      );
    }

    const chosen = await chosenProvider(organization, payload.providerId);
    if (chosen === null) {
      throw new BadRequestException(
        "No AI provider is set up for this organization yet",
      );
    }

    const source =
      askable.length === 1
        ? askable[0]!
        : await routeToSource(chosen, question, askable);

    const style = askStyleOf(engineOf(source));
    if (style === null) {
      throw new BadRequestException(
        `Asking questions is not available for ${engineOf(source).name}`,
      );
    }

    return runTurn(
      c,
      {
        log: "[ai] that question could not be answered:",
        message:
          "That source could not be read, or the provider could not be reached. Check the source and the key.",
      },
      async (turn) => {
        await turn.status("Reading the structure…");

        let answer = "";
        let problem: string | null = null;
        try {
          const context = await style.context({
            db: organization.db,
            source,
            now: new Date(),
            waitUntil: c.env.waitUntil,
          });

          await turn.status(`Asking ${chosen.name} (${chosen.model})…`);

          for await (const chunk of streamQuery(chosen, question, context, style.instructions)) {
            answer += chunk;
            await turn.delta(chunk);
          }
        } catch (caught) {
          problem =
            driverFailure(caught, "answer that question") ??
            "That source could not be read, or the provider could not be reached. Check the source and the key.";
        }

        const finished = style.readAnswer(answer);
        if (problem === null && answer.trim() === "") {
          problem =
            "That provider returned nothing. Check the key, the model id, and the base URL.";
        }
        const sql = problem === null ? finished.sql : null;
        const pipeline = problem === null ? finished.pipeline : null;
        const command = problem === null ? finished.command : null;
        const search = problem === null ? finished.search : null;
        const durationMs = Date.now() - turn.startedAt;

        const inserted = await organization.db
          .insert(aiChat)
          .values({
            organizationId: organization.organizationId,
            dataSourceId: source.id,
            providerName: chosen.name,
            model: chosen.model,
            question,
            sql:
              sql ??
              command ??
              (search === null
                ? pipeline === null
                  ? null
                  : JSON.stringify(pipeline)
                : JSON.stringify(search)),
            problem,
            durationMs,
            createdAt: new Date(),
          })
          .returning({ id: aiChat.id });

        const body: IGenerateQueryResponse = {
          chatId: inserted[0]!.id,
          dataSourceId: source.id,
          dataSourceName: source.name,
          language: style.language,
          sql,
          pipeline,
          command,
          search,
          answered: finished.outcome === "answered",
          providerName: chosen.name,
          model: chosen.model,
          durationMs,
        };

        if (problem !== null) {
          await turn.problem(problem);
        } else if (finished.outcome !== "answered") {
          await turn.problem(
            finished.outcome === "declined"
              ? "That question could not be answered from this schema."
              : "That answer came back in a shape I could not read. Ask again, or write the statement yourself.",
          );
        }

        await turn.done(body);
      },
    );
  });

  return routes;
}

function providerBaseUrl(
  spec: IAiProviderSpec,
  payload: Record<string, unknown>,
  keep: string | null,
): string | null {
  if (!spec.needsBaseUrl) {
    return baseUrlFor(spec, null);
  }
  const given = readStringOrKeep(
    payload,
    "baseUrl",
    keep ?? "",
    "That provider needs a base URL",
    200,
  );
  if (given === "") {
    throw new BadRequestException("That provider needs a base URL");
  }
  if (!/^https?:\/\//.test(given)) {
    throw new BadRequestException("The base URL must start with http:// or https://");
  }
  return baseUrlFor(spec, given);
}

async function modelsAnswer(
  organization: IOrganizationScope,
  provider: string,
  listing: ModelListing,
): Promise<IListModelsResponse> {
  if (listing.kind === "refused") {
    throw new BadRequestException("That provider's key was refused");
  }
  if (listing.kind === "unreachable") {
    throw new BadGatewayException("That provider could not be reached");
  }
  if (listing.kind === "unsupported") {
    return { source: "suggestions", models: await suggestModels(organization, provider) };
  }
  return { source: "provider", models: listing.models };
}

function optionalIdList(
  payload: Record<string, unknown>,
  field: string,
): string[] {
  const value = payload[field];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new BadRequestException("That data source id is not valid");
  }
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.length === 0 || entry.length > 64) {
      throw new BadRequestException("That data source id is not valid");
    }
    return entry;
  });
}

async function routeToSource(
  provider: AiProviderRow,
  question: string,
  candidates: DataSourceRow[],
): Promise<DataSourceRow> {
  const catalogue = candidates
    .map((candidate) => {
      const engine = engineOf(candidate);
      const target = candidate.database === null ? "" : `, database ${candidate.database}`;
      return `${candidate.id} — ${candidate.name} (${engine.name}${target})`;
    })
    .join("\n");

  let answer = "";
  for await (const chunk of streamQuery(
    provider,
    question,
    `${routeInstructions}${catalogue}\n`,
    routeInstructions,
  )) {
    answer += chunk;
  }

  const picked = answer.trim().replace(/[^A-Za-z0-9-]/g, "");
  const match = candidates.find((candidate) => candidate.id === picked);
  if (match === undefined) {
    throw new BadRequestException(
      "That question could not be matched to one of your data sources — pick a single source to ask about",
    );
  }
  return match;
}

async function promoteAnother(organization: IOrganizationScope): Promise<void> {
  const next = await organization.db
    .select({ id: aiProvider.id })
    .from(aiProvider)
    .where(organization.where(aiProvider.organizationId))
    .orderBy(aiProvider.createdAt)
    .limit(1);
  if (next[0] !== undefined) {
    await organization.db
      .update(aiProvider)
      .set({ isDefault: true })
      .where(eq(aiProvider.id, next[0].id));
  }
}
