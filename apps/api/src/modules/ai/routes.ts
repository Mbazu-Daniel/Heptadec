import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@heptadec/db";
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
import { savedConnection } from "../data-source/connection";
import { introspectPostgres } from "../schema/postgres";
import { AI_PROVIDERS, providerSpec } from "./catalog";
import { schemaContext } from "./context";
import { readStatement, streamQuery } from "./generate";
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
    await requireOwner(c.req.raw.headers);

    const rows = await db
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
    await requireOwner(c.req.raw.headers);

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
    const [row] = await db.transaction(async (tx) => {
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
          apiKey: encryptSecret(apiKey),
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

    const actor = auditActor(c);
    await recordAudit({
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
    await requireOwner(c.req.raw.headers);

    const found = await oneRow(aiProvider, c.req.param("id"), organization);
    if (found === undefined) {
      throw new NotFoundException("That provider does not exist");
    }

    const removed = await db
      .delete(aiProvider)
      .where(
        and(
          eq(aiProvider.id, found.id),
          organization.where(aiProvider.organizationId),
        ),
      )
      .returning({ id: aiProvider.id });

    if (removed.length > 0 && found.isDefault) {
      await promoteAnother(organization.organizationId);
    }

    const actor = auditActor(c);
    await recordAudit({
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
    await requireOwner(c.req.raw.headers);

    const found = await oneRow(aiProvider, c.req.param("id"), organization);
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

    if (!(await can(c.req.raw.headers, "query", "create"))) {
      throw new ForbiddenException("Only owners and editors can ask questions");
    }

    const payload = readBody(await c.req.json(), "A question is required");
    const question = readString(
      payload,
      "question",
      "Ask the question in words",
      MAX_QUESTION,
    );
    const dataSourceId = readString(
      payload,
      "dataSourceId",
      "Choose the data source to ask about",
      64,
    );

    const source = await oneRow(dataSource, dataSourceId, organization);
    if (source === undefined) {
      throw new NotFoundException("That data source does not exist");
    }
    if (source.kind !== "postgres") {
      throw new BadRequestException(
        `Asking questions is only available for postgres, not ${source.kind}`,
      );
    }

    const chosen = await chosenProvider(
      organization.organizationId,
      payload.providerId,
    );
    if (chosen === null) {
      throw new BadRequestException(
        "No AI provider is set up for this organization yet",
      );
    }

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
        const described = await introspectPostgres(savedConnection(source));
        const context = schemaContext({ sourceId: source.id, ...described });

        await stream.writeSSE({
          event: "status",
          data: JSON.stringify({
            message: `Asking ${chosen.name} (${chosen.model})…`,
          }),
        });

        for await (const chunk of streamQuery(chosen, question, context)) {
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

      const finished = readStatement(answer);
      if (problem === null && answer.trim() === "") {
        problem =
          "That provider returned nothing. Check the key, the model id, and the base URL.";
      }
      const sql = problem === null ? finished.sql : null;
      const durationMs = Date.now() - startedAt;

      const inserted = await db
        .insert(aiChat)
        .values({
          organizationId: organization.organizationId,
          dataSourceId: source.id,
          providerName: chosen.name,
          model: chosen.model,
          question,
          sql,
          problem,
          durationMs,
          createdAt: new Date(),
        })
        .returning({ id: aiChat.id });

      const body: IGenerateQueryResponse = {
        chatId: inserted[0]!.id,
        sql,
        answered: sql !== null,
        providerName: chosen.name,
        model: chosen.model,
        durationMs,
      };

      if (problem !== null) {
        await stream.writeSSE({
          event: "problem",
          data: JSON.stringify({ message: problem }),
        });
      } else if (sql === null) {
        await stream.writeSSE({
          event: "problem",
          data: JSON.stringify({
            message: "That question could not be answered from this schema.",
          }),
        });
      }

      await stream.writeSSE({ event: "done", data: JSON.stringify(body) });
    });
  });

  return routes;
}

async function requireOwner(headers: Headers): Promise<void> {
  if (!(await can(headers, "invitation", "create"))) {
    throw new ForbiddenException("Only owners can manage AI providers");
  }
}

async function promoteAnother(organizationId: string): Promise<void> {
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
