import { Agent } from "@mastra/core/agent";
import { StreamErrorRetryProcessor } from "@mastra/core/processors";
import type { AiProviderRow } from "@heptadec/db";
import { decryptSecret } from "../data-source/secret";
import { aiRuntime } from "./mastra";
import { historyCompat } from "./provider-compat";
import { providerEndpointFor } from "./transport";

const ANSWER_TIMEOUT_MS = 60_000;

const PLAN_TIMEOUT_MS = 180_000;

const agentFor = async (
  row: AiProviderRow,
  instructions: string,
): Promise<Agent> => {
  const endpoint = providerEndpointFor(row.provider, row.baseUrl);

  const runtime = aiRuntime();
  return new Agent({
    id: "heptadec",
    name: "heptadec",
    instructions,
    model: {
      providerId: endpoint.spec.id,
      modelId: row.model,
      url: endpoint.baseUrl,
      apiKey: await decryptSecret(row.apiKey),
      api: "chat",
    },
    mastra: runtime.mastra,
    ...(runtime.memory ? { memory: runtime.memory } : {}),
    inputProcessors: [historyCompat],
    errorProcessors: [new StreamErrorRetryProcessor({ maxRetries: 0 })],
    maxProcessorRetries: 0,
  });
};

export async function* streamModel(
  row: AiProviderRow,
  instructions: string,
  prompt: string,
): AsyncGenerator<string, void, undefined> {
  const agent = await agentFor(row, instructions);
  const stream = await agent.stream(prompt, {
    abortSignal: AbortSignal.timeout(ANSWER_TIMEOUT_MS),
  });

  for await (const chunk of stream.textStream) {
    yield chunk;
  }
}

export async function complete(
  row: AiProviderRow,
  instructions: string,
  prompt: string,
): Promise<string> {
  const agent = await agentFor(row, instructions);
  const result = await agent.generate(prompt, {
    abortSignal: AbortSignal.timeout(PLAN_TIMEOUT_MS),
  });

  return result.text;
}
