import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { and, eq } from "drizzle-orm";
import {
  schema,
  type AiProviderRow,
  type DataSourceRow,
  type HeptadecDatabase,
} from "@heptadec/db";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  activeOrganization,
  oneRow,
} from "../../common/session/current-organization";
import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions";
import { readBody, readString } from "../../common/http/body";
import { can } from "../rbac/authorize";
import { recordAudit, auditActor } from "../audit";
import { encryptSecret } from "../data-source/secret";
import { storedFromRow } from "../data-source/connection";
import {
  canBeAsked,
  engineOf,
  type IEngineSpec,
  type QueryLanguage,
} from "../data-source/contracts";
import { introspectSchema } from "../schema/introspect";
import { AI_PROVIDERS, providerSpec } from "./catalog";
import { quickwitContext, redisContext, schemaContext } from "./context";
import { readStatement, streamQuery } from "./generate";
import {
  mongoInstructions,
  queryInstructions,
  quickwitInstructions,
  redisInstructions,
  routeInstructions,
} from "./instructions";
import { chosenProvider } from "./provider";
import { listModels, suggestModels } from "./models";
import type {
  ICreateAiProviderResponse,
  IAiProviderListResponse,
  IDeleteAiProviderResponse,
  IGenerateQueryResponse,
  IListModelsResponse,
} from "./contracts";

const { aiProvider, aiChat, dataSource } = schema;

const MAX_NAME = 60;

const MAX_MODEL = 120;

const MAX_QUESTION = 2_000;

export function aiRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/ai/providers", requireSession, async (c) => {
    const organization = activeOrganization(c);
    await requireOwner(organization.db, c.req.raw.headers);

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
      catalog: AI_PROVIDERS,
    };
    return c.json(body);
  });

  routes.post("/api/ai/providers", requireSession, async (c) => {
    const organization = activeOrganization(c);
    await requireOwner(organization.db, c.req.raw.headers);

    const payload = readBody(await c.req.json(), "A provider is required");
    const name = readString(payload, "name", "Give the provider a name", MAX_NAME);
    const provider = readString(payload, "provider", "Choose a provider", 40);
    const spec = providerSpec(provider);
    if (spec === null) {
      throw new BadRequestException("That provider is not one we know");
    }
    const model = readString(payload, "model", "Name the model to use", MAX_MODEL);
    const apiKey = readString(payload, "apiKey", "Paste the provider's API key", 400);
    const isDefault = payload.isDefault === true;

    let baseUrl: string | null = spec.baseUrl === "" ? null : spec.baseUrl;
    if (spec.needsBaseUrl) {
      const given = readString(payload, "baseUrl", "That provider needs a base URL", 200);
      if (!/^https?:\/\//.test(given)) {
        throw new BadRequestException("The base URL must start with http:// or https://");
      }
      baseUrl = given.replace(/\/+$/, "");
    }

    const now = new Date();
    const [row] = await organization.db.transaction(async (tx) => {
      if (isDefault) {
        await tx
          .update(aiProvider)
          .set({ isDefault: false, updatedAt: now })
          .where(organization.where(aiProvider.organizationId));
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

    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
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
    await requireOwner(organization.db, c.req.raw.headers);

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
      await promoteAnother(organization.db, organization.organizationId);
    }

    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "ai_provider.deleted",
      targetKind: "ai_provider",
      targetId: found.id,
      targetLabel: found.name,
    });

    const body: IDeleteAiProviderResponse = { removed: found.id };
    return c.json(body);
  });

  routes.get("/api/ai/providers/:id/models", requireSession, async (c) => {
    const organization = activeOrganization(c);
    await requireOwner(organization.db, c.req.raw.headers);

    const found = await oneRow(organization.db, aiProvider, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That provider does not exist");
    }

    const listing = await listModels(found);
    if (listing.kind === "refused") {
      throw new BadRequestException("That provider's key was refused");
    }
    if (listing.kind === "unreachable") {
      throw new BadGatewayException("That provider could not be reached");
    }
    if (listing.kind === "unsupported") {
      const suggestions = await suggestModels(
        organization.db,
        organization.organizationId,
        found.provider,
      );
      const body: IListModelsResponse = { source: "suggestions", models: suggestions };
      return c.json(body);
    }

    const body: IListModelsResponse = { source: "provider", models: listing.models };
    return c.json(body);
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

    // Asking every source is the default; a picker narrows the question to the
    // ones it is actually about.
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

    const chosen = await chosenProvider(
      organization.db,
      organization.organizationId,
      payload.providerId,
    );
    if (chosen === null) {
      throw new BadRequestException(
        "No AI provider is set up for this organization yet",
      );
    }

    const source =
      askable.length === 1
        ? askable[0]!
        : await routeToSource(chosen, question, askable);

    const style = askStyle(engineOf(source));
    if (style === null) {
      throw new BadRequestException(
        `Asking questions is not available for ${engineOf(source).name}`,
      );
    }
    const { instructions, language } = style;

    const startedAt = Date.now();

    return streamSSE(c, async (stream) => {
      stream.onAbort(() => {
        void stream.abort();
      });

      await stream.writeSSE({
        event: "status",
        data: JSON.stringify({ message: "Reading the structure…" }),
      });

      let answer = "";
      let problem: string | null = null;
      try {
        const stored = await storedFromRow(source);
        const context =
          language === "search"
            ? await quickwitContext(stored)
            : language === "command"
              ? await redisContext(stored)
            : schemaContext({
                sourceId: source.id,
                ...(await introspectSchema(stored, source.readOnly)),
              });

        await stream.writeSSE({
          event: "status",
          data: JSON.stringify({
            message: `Asking ${chosen.name} (${chosen.model})…`,
          }),
        });

        for await (const chunk of streamQuery(chosen, question, context, instructions)) {
          answer += chunk;
          await stream.writeSSE({
            event: "delta",
            data: JSON.stringify({ text: chunk }),
          });
        }
      } catch (caught) {
        console.error(`[ai] that question could not be answered:`, caught);
        problem =
          "That source could not be read, or the provider could not be reached. Check the source and the key.";
      }

      const finished = readStatement(answer, language);
      if (problem === null && answer.trim() === "") {
        problem =
          "That provider returned nothing. Check the key, the model id, and the base URL.";
      }
      const sql = problem === null ? finished.sql : null;
      const pipeline = problem === null ? finished.pipeline : null;
      const command = problem === null ? finished.command : null;
      const search = problem === null ? finished.search : null;
      const durationMs = Date.now() - startedAt;

      const inserted = await organization.db
        .insert(aiChat)
        .values({
          organizationId: organization.organizationId,
          dataSourceId: source.id,
          providerName: chosen.name,
          model: chosen.model,
          question,
          // One column holds whichever statement the engine runs: SQL, a Redis
          // command, or the JSON of an aggregation pipeline.
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
        language,
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
        await stream.writeSSE({
          event: "problem",
          data: JSON.stringify({ message: problem }),
        });
      } else if (finished.outcome !== "answered") {
        await stream.writeSSE({
          event: "problem",
          data: JSON.stringify({
            message:
              finished.outcome === "declined"
                ? "That question could not be answered from this schema."
                : "That answer came back in a shape I could not read. Ask again, or write the statement yourself.",
          }),
        });
      }

      await stream.writeSSE({ event: "done", data: JSON.stringify(body) });
    });
  });

  return routes;
}

/**
 * The ids a request narrowed a question to. Absent, null, or an empty list all
 * mean the same thing: search every source the organization owns.
 */
function optionalIdList(
  payload: Record<string, unknown>,
  field: string,
): string[] {
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
}

/**
 * How a source is asked about: the instructions the model is given, and the
 * language the answer comes back in.
 *
 * Answered per language rather than by trying an instruction set and catching
 * the refusal, so a source the app cannot ask about says so here rather than
 * being discovered at the point of asking. SQL is the one language whose
 * instructions depend on the engine, so it takes the dialect; every other
 * language is written the same whichever engine speaks it.
 */
function askStyle(engine: IEngineSpec): {
  instructions: string;
  language: QueryLanguage;
} | null {
  switch (engine.queryLanguage) {
    case "pipeline":
      return { instructions: mongoInstructions, language: "pipeline" };
    case "command":
      return { instructions: redisInstructions, language: "command" };
    case "search":
      return { instructions: quickwitInstructions, language: "search" };
    case "sql":
      return engine.sqlDialect === null
        ? null
        : { instructions: queryInstructions(engine.sqlDialect), language: "sql" };
    case null:
      return null;
  }
}

/**
 * Ask which of several sources answers the question. Only the name and database
 * are sent: reading every candidate's structure would cost a round trip each,
 * and the second pass reads the winner properly anyway.
 */
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

async function requireOwner(db: HeptadecDatabase, headers: Headers): Promise<void> {
  if (!(await can(db, headers, "invitation", "create"))) {
    throw new ForbiddenException("Only owners can manage AI providers");
  }
}

async function promoteAnother(
  db: HeptadecDatabase,
  organizationId: string,
): Promise<void> {
  const next = await db
    .select({ id: aiProvider.id })
    .from(aiProvider)
    .where(eq(aiProvider.organizationId, organizationId))
    .orderBy(aiProvider.createdAt)
    .limit(1);
  if (next[0] !== undefined) {
    await db
      .update(aiProvider)
      .set({ isDefault: true })
      .where(eq(aiProvider.id, next[0].id));
  }
}
