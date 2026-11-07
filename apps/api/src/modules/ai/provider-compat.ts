import { ProviderHistoryCompat } from "@mastra/core/processors";
import type { CompatRule } from "@mastra/core/processors";

const stripAssistantReasoning: CompatRule = {
  name: "heptadec-strip-assistant-reasoning",
  applyToPrompt: ({ prompt }) => {
    const carriesReasoning = prompt.some(
      (message) =>
        message.role === "assistant" &&
        message.content.some((part) => part.type === "reasoning"),
    );

    if (!carriesReasoning) return undefined;

    return prompt.map((message) =>
      message.role === "assistant"
        ? {
            ...message,
            content: message.content.filter((part) => part.type !== "reasoning"),
          }
        : message,
    );
  },
};

export const historyCompat = new ProviderHistoryCompat({
  additionalRules: [stripAssistantReasoning],
});
