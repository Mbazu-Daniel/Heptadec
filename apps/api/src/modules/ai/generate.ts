import { streamText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AiProviderRow } from "@heptadec/db";
import { decryptSecret } from "../data-source/secret";
import { providerEndpointFor } from "./transport";

const ANSWER_TIMEOUT_MS = 60_000;

const PLAN_TIMEOUT_MS = 180_000;

async function* streamWith(
  row: AiProviderRow,
  system: string,
  user: string,
  timeoutMs: number,
): AsyncGenerator<string, void, undefined> {
  const endpoint = providerEndpointFor(row.provider, row.baseUrl);

  const model = createOpenAICompatible({
    name: endpoint.spec.id,
    apiKey: await decryptSecret(row.apiKey),
    baseURL: endpoint.baseUrl,
  }).chatModel(row.model);

  const result = streamText({
    model,
    system,
    prompt: user,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(timeoutMs),
  });

  for await (const chunk of result.textStream) {
    yield chunk;
  }
}

export async function* streamQuery(
  row: AiProviderRow,
  question: string,
  schemaContext: string,
  instructions: string,
): AsyncGenerator<string, void, undefined> {
  yield* streamWith(
    row,
    instructions,
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
