import { Agent } from "@mastra/core/agent";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AiProviderRow } from "@heptadec/db";
import { decryptSecret } from "../data-source/secret";
import { providerSpec } from "./catalog";
import { nlToQueryInstructions } from "./instructions";

const ANSWER_TIMEOUT_MS = 60_000;

const PLAN_TIMEOUT_MS = 180_000;

export interface IGeneratedQuery {
  sql: string | null;
  answered: boolean;
}

async function* streamWith(
  row: AiProviderRow,
  system: string,
  user: string,
  timeoutMs: number,
): AsyncGenerator<string, void, undefined> {
  const spec = providerSpec(row.provider);
  if (spec === null) {
    throw new Error(`Unknown AI provider ${row.provider}`);
  }
  const baseUrl = spec.needsBaseUrl ? row.baseUrl : spec.baseUrl;
  if (baseUrl === null || baseUrl === "") {
    throw new Error(`${spec.label} needs a base URL`);
  }

  const model = createOpenAICompatible({
    name: spec.id,
    apiKey: decryptSecret(row.apiKey),
    baseURL: baseUrl,
  }).chatModel(row.model);

  const agent = new Agent({
    id: "heptadec-nl2sql",
    name: "heptadec-nl2sql",
    instructions: system,
    model,
    maxRetries: 0,
  });

  const stream = await agent.stream(user, {
    abortSignal: AbortSignal.timeout(timeoutMs),
  });

  for await (const chunk of stream.textStream) {
    yield chunk;
  }
}

export async function* streamQuery(
  row: AiProviderRow,
  question: string,
  schemaContext: string,
): AsyncGenerator<string, void, undefined> {
  yield* streamWith(
    row,
    nlToQueryInstructions,
    `Schema:\n${schemaContext}\n\nQuestion: ${question}`,
    ANSWER_TIMEOUT_MS,
  );
}

export async function complete(
  row: AiProviderRow,
  system: string,
  user: string,
): Promise<string> {
  let text = "";
  for await (const chunk of streamWith(row, system, user, PLAN_TIMEOUT_MS)) {
    text += chunk;
  }
  return text;
}

export function readStatement(text: string): IGeneratedQuery {
  const cleaned = text
    .replace(/^```(?:sql)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (cleaned === "" || cleaned.toUpperCase().startsWith("UNANSWERABLE")) {
    return { sql: null, answered: false };
  }
  return { sql: cleaned, answered: true };
}
