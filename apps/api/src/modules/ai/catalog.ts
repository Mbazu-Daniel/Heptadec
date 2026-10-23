import type { AiProtocol } from "./transport";

export interface IAiProviderSpec {
  id: string;
  label: string;
  baseUrl: string;
  needsBaseUrl: boolean;
  exampleBaseUrl?: string;
  /** The wire protocol this provider speaks. */
  protocol: AiProtocol | "anthropic";
}

export const AI_PROVIDERS: IAiProviderSpec[] = [
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    needsBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    needsBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    needsBaseUrl: false,
    protocol: "anthropic",
  },
  {
    id: "google",
    label: "Google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    needsBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    needsBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    needsBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "xai",
    label: "xAI",
    baseUrl: "https://api.x.ai/v1",
    needsBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    needsBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    needsBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    needsBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    needsBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    needsBaseUrl: false,
    protocol: "openai-compatible",
  },
  {
    id: "cloudflare",
    label: "Cloudflare AI Gateway",
    baseUrl: "",
    needsBaseUrl: true,
    exampleBaseUrl:
      "https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/openai",
    protocol: "openai-compatible",
  },
  {
    id: "openai-compatible",
    label: "Any OpenAI-compatible endpoint",
    baseUrl: "",
    needsBaseUrl: true,
    exampleBaseUrl: "https://your-gateway.example.com/v1",
    protocol: "openai-compatible",
  },
];

export function providerSpec(id: string): IAiProviderSpec | null {
  return AI_PROVIDERS.find((entry) => entry.id === id) ?? null;
}
