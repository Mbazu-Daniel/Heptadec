import type { AiProtocol } from "./transport";

import modelsApi from "./models-api.json";

const DEFAULT_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  anthropic: "https://api.anthropic.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  deepseek: "https://api.deepseek.com/v1",
  mistral: "https://api.mistral.ai/v1",
  xai: "https://api.x.ai/v1",
  cerebras: "https://api.cerebras.ai/v1",
  togetherai: "https://api.together.xyz/v1",
  together: "https://api.together.xyz/v1",
  fireworks: "https://api.fireworks.ai/inference/v1",
  ollama: "http://localhost:11434/v1",
};

interface IModelsDevProvider {
  id: string;
  name: string;
  api?: string | null;
  npm?: string | null;
  models?: Record<string, unknown> | null;
}

function protocolFor(npm: string | null | undefined): AiProtocol | "anthropic" {
  return npm === "@ai-sdk/anthropic" ? "anthropic" : "openai-compatible";
}

export interface IAiProviderSpec {
  id: string;
  label: string;
  baseUrl: string;
  needsBaseUrl: boolean;
  exampleBaseUrl?: string;
  /** The wire protocol this provider speaks. */
  protocol: AiProtocol | "anthropic";
  /** Static model ids from the catalog, so the form can offer them without a key. */
  models?: readonly string[];
}

function toSpec(provider: IModelsDevProvider): IAiProviderSpec {
  const baseUrl = provider.api ?? DEFAULT_BASE_URLS[provider.id] ?? "";
  return {
    id: provider.id,
    label: provider.name || provider.id,
    baseUrl,
    needsBaseUrl: baseUrl === "",
    protocol: protocolFor(provider.npm),
    models: provider.models ? Object.keys(provider.models) : undefined,
  };
}

export const AI_PROVIDERS: IAiProviderSpec[] = (
  Object.values(modelsApi) as IModelsDevProvider[]
)
  .map(toSpec)
  .concat([
    {
      id: "openai-compatible",
      label: "Any OpenAI-compatible endpoint",
      baseUrl: "",
      needsBaseUrl: true,
      exampleBaseUrl: "https://your-gateway.example.com/v1",
      protocol: "openai-compatible",
    },
  ]);

export function providerSpec(id: string): IAiProviderSpec | null {
  return AI_PROVIDERS.find((entry) => entry.id === id) ?? null;
}
