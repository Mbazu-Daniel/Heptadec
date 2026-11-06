import { and, eq } from "drizzle-orm";
import {
  aiChat,
  aiProvider,
  dataSource,
  type AiProviderRow,
  type DataSourceRow,
} from "@heptadec/db";
import {
  oneRow,
  type IOrganizationScope,
} from "../../common/session/current-organization";
import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from "../../common/exceptions/index";
import { encryptSecret, decryptSecret } from "../data-source/secret";
import { storedFromRow } from "../data-source/connection";
import { canBeAsked, engineOf } from "../data-source/engines";
import { AI_PROVIDERS, providerSpec } from "./catalog";
import { baseUrlFor, speaksProtocol } from "./transport";
import { listModels, suggestModels } from "./models";
import { chosenProvider } from "./provider";
import { askStyleOf } from "./ask";
import { streamModel } from "./generate";
import { routeInstructions } from "./instructions";
import { failureMessage, providerStatusSentence } from "./failure";
import { queryPrompt, streamAnswer } from "./answer";
import type { IAiProviderSpec, ModelListing } from "./types";
import type { IStreamTurn } from "../../common/http/stream";
import type { IAiProvider, IGenerateQueryResponse, IListModelsResponse } from "./contracts";
import type {
  IAskInput,
  IAiProviderList,
  ICreateAiProviderInput,
  IListProviderModelsInput,
} from "./types";

const OUTCOME_PROBLEMS: Record<"declined" | "empty" | "unreadable", string> = {
  declined: "That question could not be answered from this schema.",
  empty: "That provider returned nothing. Check the key, the model id, and the base URL.",
  unreadable:
    "That answer came back in a shape I could not read. Ask again, or write the statement yourself.",
};

const toProvider = (row: AiProviderRow): IAiProvider => ({
  id: row.id,
  name: row.name,
  provider: row.provider,
  providerLabel: providerSpec(row.provider)?.label ?? row.provider,
  model: row.model,
  baseUrl: row.baseUrl,
  isDefault: row.isDefault,
  createdAt: row.createdAt.toISOString(),
});

export async function listProviders(
  organization: IOrganizationScope,
): Promise<IAiProviderList> {
  const rows = await organization.db
    .select()
    .from(aiProvider)
    .where(organization.where(aiProvider.organizationId))
    .orderBy(aiProvider.createdAt);

  return {
    providers: rows.map(toProvider),
    catalog: AI_PROVIDERS.filter(speaksProtocol),
  };
}

export async function createProvider(
  organization: IOrganizationScope,
  input: ICreateAiProviderInput,
): Promise<IAiProvider> {
  const spec = supportedSpec(input.provider);
  const baseUrl = providerBaseUrl(spec, input.baseUrl);
  const now = new Date();

  const inserted = organization.db.insert(aiProvider).values({
    organizationId: organization.organizationId,
    name: input.name,
    provider: input.provider,
    model: input.model,
    baseUrl,
    apiKey: await encryptSecret(input.apiKey),
    isDefault: input.isDefault,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = input.isDefault
    ? (
        await organization.db.batch([
          organization.db
            .update(aiProvider)
            .set({ isDefault: false, updatedAt: now })
            .where(organization.where(aiProvider.organizationId)),
          inserted.returning(),
        ])
      )[1]
    : (await organization.db.batch([inserted.returning()]))[0];

  if (row === undefined) {
    throw new NotFoundException("That provider could not be saved");
  }

  return { ...toProvider(row), providerLabel: spec.label };
}

export async function deleteProvider(
  organization: IOrganizationScope,
  id: string,
): Promise<AiProviderRow> {
  const found = await oneRow(organization.db, aiProvider, id, organization);
  if (found === undefined) {
    throw new NotFoundException("That provider does not exist");
  }

  const removed = await organization.db
    .delete(aiProvider)
    .where(
      and(eq(aiProvider.id, found.id), organization.where(aiProvider.organizationId)),
    )
    .returning({ id: aiProvider.id });

  if (removed.length > 0 && found.isDefault) {
    await promoteAnother(organization);
  }

  return found;
}

export async function providerModels(
  organization: IOrganizationScope,
  id: string,
): Promise<IListModelsResponse> {
  const found = await oneRow(organization.db, aiProvider, id, organization);
  if (found === undefined) {
    throw new NotFoundException("That provider does not exist");
  }

  const listing = await listModels({
    provider: found.provider,
    baseUrl: found.baseUrl,
    apiKey: await decryptSecret(found.apiKey),
  });

  return modelsAnswer(organization, found.provider, listing);
}

export async function draftModels(
  organization: IOrganizationScope,
  input: IListProviderModelsInput,
): Promise<IListModelsResponse> {
  const spec = supportedSpec(input.provider);
  const listing = await listModels({
    provider: input.provider,
    baseUrl: providerBaseUrl(spec, input.baseUrl),
    apiKey: input.apiKey,
  });

  return modelsAnswer(organization, input.provider, listing);
}

export async function ask(
  organization: IOrganizationScope,
  input: IAskInput,
  turn: IStreamTurn,
): Promise<IGenerateQueryResponse> {
  const owned = await organization.db
    .select()
    .from(dataSource)
    .where(organization.where(dataSource.organizationId))
    .orderBy(dataSource.createdAt);

  const scoped =
    input.dataSourceIds.length === 0
      ? owned
      : owned.filter((candidate) => input.dataSourceIds.includes(candidate.id));
  if (input.dataSourceIds.length > 0 && scoped.length !== input.dataSourceIds.length) {
    throw new NotFoundException("That data source does not exist");
  }

  const askable = scoped.filter(canBeAsked);
  if (askable.length === 0) {
    throw new BadRequestException(
      "None of those sources can be asked about — a command or search source has no queryable structure",
    );
  }

  const chosen = await chosenProvider(organization, input.providerId);
  if (chosen === null) {
    throw new BadRequestException("No AI provider is set up for this organization yet");
  }

  const source =
    askable.length === 1
      ? askable[0]!
      : await routeToSource(chosen, input.question, askable);

  const style = askStyleOf(engineOf(source));
  if (style === null) {
    throw new BadRequestException(
      `Asking questions is not available for ${engineOf(source).name}`,
    );
  }

  await turn.status("Reading the structure…");

  let answer = "";
  let problem: string | null = null;
  try {
    const stored = await storedFromRow(source);
    const context = await style.context(source.id, stored);

    answer = await streamAnswer(
      turn,
      {
        provider: chosen,
        instructions: style.instructions,
        prompt: queryPrompt(context, input.question),
      },
      (chunk) => turn.delta(chunk),
    );
  } catch (caught) {
    problem = failureMessage(
      caught,
      "answer that question",
      "That source could not be read, or the provider could not be reached. Check the source and the key.",
    );
  }

  const finished = style.readAnswer(answer);
  if (problem === null && finished.outcome === "empty") {
    problem = OUTCOME_PROBLEMS.empty;
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
      question: input.question,
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

  const message =
    problem ??
    (finished.outcome === "answered" ? null : OUTCOME_PROBLEMS[finished.outcome]);
  if (message !== null) {
    await turn.problem(message);
  }

  await turn.done(body);
  return body;
}

function supportedSpec(provider: string): IAiProviderSpec {
  const spec = providerSpec(provider);
  if (spec === null) {
    throw new BadRequestException("That provider is not one we know");
  }
  if (!speaksProtocol(spec)) {
    throw new BadRequestException(
      `${spec.label} is not supported yet — its API does not speak the protocol this app speaks`,
    );
  }
  return spec;
}

function providerBaseUrl(
  spec: IAiProviderSpec,
  given: string | undefined,
): string | null {
  if (!spec.needsBaseUrl) {
    return baseUrlFor(spec, null);
  }
  if (given === undefined || !/^https?:\/\//.test(given)) {
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
  if (listing.kind === "status") {
    throw new BadGatewayException(
      providerStatusSentence(listing.status, "") ??
        "That provider could not be reached",
    );
  }
  if (listing.kind === "unsupported") {
    return { source: "suggestions", models: await suggestModels(organization, provider) };
  }
  return { source: "provider", models: listing.models };
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
  try {
    for await (const chunk of streamModel(
      provider,
      routeInstructions,
      `Schema:\n${routeInstructions}${catalogue}\n\nQuestion: ${question}`,
    )) {
      answer += chunk;
    }
  } catch (caught) {
    throw new BadGatewayException(
      failureMessage(
        caught,
        "match that question to a source",
        "That source could not be read, or the provider could not be reached. Check the source and the key.",
      ),
    );
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
