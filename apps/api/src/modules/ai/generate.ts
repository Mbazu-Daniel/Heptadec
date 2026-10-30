import { Agent } from "@mastra/core/agent";
import type { AiProviderRow } from "@heptadec/db";
import { decryptSecret } from "../data-source/secret";
import { providerEndpointFor } from "./transport";

const ANSWER_TIMEOUT_MS = 60_000;

const PLAN_TIMEOUT_MS = 180_000;

/**
 * Whether a stored model id already carries the `provider/model` namespace Mastra
 * expects. A model named for a custom endpoint usually has none; one saved from a
 * router-style provider (`ollama/qwen2`) keeps what it was saved as.
 */
function isNamespaced(model: string): model is `${string}/${string}` {
  return model.includes("/");
}

async function answerAgent(
  row: AiProviderRow,
  system: string,
): Promise<Agent> {
  const endpoint = providerEndpointFor(row.provider, row.baseUrl);
  const apiKey = await decryptSecret(row.apiKey);
  return new Agent({
    id: "answer-agent",
    name: "Answer Agent",
    instructions: system,
    model: {
      id: isNamespaced(row.model) ? row.model : `custom/${row.model}`,
      url: endpoint.baseUrl,
      apiKey,
    },
  });
}

async function* streamWith(
  row: AiProviderRow,
  system: string,
  user: string,
  timeoutMs: number,
): AsyncGenerator<string, void, undefined> {
  const agent = await answerAgent(row, system);
  const stream = await agent.stream(user, {
    abortSignal: AbortSignal.timeout(timeoutMs),
    modelSettings: { maxRetries: 0 },
  });

  for await (const chunk of stream.textStream) {
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
  const agent = await answerAgent(row, system);
  const result = await agent.generate(user, {
    abortSignal: AbortSignal.timeout(PLAN_TIMEOUT_MS),
    modelSettings: { maxRetries: 0 },
  });
  return result.text;
}
