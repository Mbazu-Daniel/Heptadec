import { IStreamTurn } from "../../common/http/stream";
import { complete, streamModel } from "./generate";
import type { IAnswerCall, IAnswerSource } from "./types";

export async function readSources(
  turn: IStreamTurn,
  sources: readonly IAnswerSource[],
): Promise<string[]> {
  const blocks: string[] = [];
  for (const source of sources) {
    await turn.status(`Reading ${source.name}…`);
    blocks.push(await source.read());
  }
  return blocks;
}

export async function streamAnswer(
  turn: IStreamTurn,
  call: IAnswerCall,
  onText: (text: string) => Promise<void>,
): Promise<string> {
  await turn.status(`Asking ${call.provider.name} (${call.provider.model})…`);
  let answer = "";
  for await (const chunk of streamModel(
    call.provider,
    call.instructions,
    call.prompt,
  )) {
    answer += chunk;
    await onText(chunk);
  }
  return answer;
}

export async function completeAnswer(
  turn: IStreamTurn,
  call: IAnswerCall,
): Promise<string> {
  await turn.status(`Asking ${call.provider.name} (${call.provider.model})…`);
  return complete(call.provider, call.instructions, call.prompt);
}

export const queryPrompt = (context: string, question: string): string =>
  `Schema:\n${context}\n\nQuestion: ${question}`;
