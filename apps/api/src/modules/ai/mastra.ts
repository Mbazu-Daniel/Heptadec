import { Mastra } from "@mastra/core/mastra";
import { Memory } from "@mastra/memory";
import type { MastraCompositeStore } from "@mastra/core/storage";

export type AiRuntime = {
  readonly mastra: Mastra;
  readonly memory?: Memory;
};

const HISTORY_TURN_LIMIT = 20;

let runtime: AiRuntime | null = null;

export function configureAiRuntime(storage: MastraCompositeStore): void {
  if (runtime !== null) {
    return;
  }
  const memory = new Memory({
    storage,
    options: { lastMessages: HISTORY_TURN_LIMIT },
  });
  runtime = {
    mastra: new Mastra({ storage, memory: { default: memory } }),
    memory,
  };
}

export function aiRuntime(): AiRuntime {
  if (runtime === null) {
    runtime = { mastra: new Mastra() };
  }
  return runtime;
}
