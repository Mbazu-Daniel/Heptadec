export interface IAiProviderSpec {
  id: string;
  label: string;
  baseUrl: string;
  needsBaseUrl: boolean;
  exampleBaseUrl?: string;
}

export const AI_PROVIDERS: IAiProviderSpec[] = [
  {
    id: "groq",
    label: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    needsBaseUrl: false,
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    needsBaseUrl: false,
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    needsBaseUrl: false,
  },
  {
    id: "google",
    label: "Google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    needsBaseUrl: false,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    needsBaseUrl: false,
  },
  {
    id: "mistral",
    label: "Mistral",
    baseUrl: "https://api.mistral.ai/v1",
    needsBaseUrl: false,
  },
  {
    id: "xai",
    label: "xAI",
    baseUrl: "https://api.x.ai/v1",
    needsBaseUrl: false,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    needsBaseUrl: false,
  },
  {
    id: "cerebras",
    label: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1",
    needsBaseUrl: false,
  },
  {
    id: "together",
    label: "Together AI",
    baseUrl: "https://api.together.xyz/v1",
    needsBaseUrl: false,
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    needsBaseUrl: false,
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    baseUrl: "http://localhost:11434/v1",
    needsBaseUrl: false,
  },
  {
    id: "cloudflare",
    label: "Cloudflare AI Gateway",
    baseUrl: "",
    needsBaseUrl: true,
    exampleBaseUrl:
      "https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/openai",
  },
  {
    id: "openai-compatible",
    label: "Any OpenAI-compatible endpoint",
    baseUrl: "",
    needsBaseUrl: true,
    exampleBaseUrl: "https://your-gateway.example.com/v1",
  },
];

export function providerSpec(id: string): IAiProviderSpec | null {
  return AI_PROVIDERS.find((entry) => entry.id === id) ?? null;
}
