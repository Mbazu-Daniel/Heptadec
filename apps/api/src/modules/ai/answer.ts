import {
  APICallError,
  EmptyResponseBodyError,
  NoContentGeneratedError,
} from "ai";
import type { AiProviderRow } from "@heptadec/db";
import { driverFailure, logDriverFailure } from "../../common/driver-error";
import { complete, streamModel } from "./generate";
import type { ITurn } from "./turn";

export interface IAnswerSource {
  readonly name: string;
  read(): Promise<string>;
}

export interface IAnswerCall {
  provider: AiProviderRow;
  instructions: string;
  prompt: string;
}

export async function readSources(
  turn: ITurn,
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
  turn: ITurn,
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
  turn: ITurn,
  call: IAnswerCall,
): Promise<string> {
  await turn.status(`Asking ${call.provider.name} (${call.provider.model})…`);
  return complete(call.provider, call.instructions, call.prompt);
}

export function queryPrompt(context: string, question: string): string {
  return `Schema:\n${context}\n\nQuestion: ${question}`;
}

export function failureMessage(
  caught: unknown,
  action: string,
  fallback: string,
): string {
  const provider = providerFailure(caught);
  if (provider !== null) {
    logDriverFailure(caught, action);
    return provider;
  }
  return driverFailure(caught, action) ?? fallback;
}

function providerFailure(caught: unknown): string | null {
  if (
    caught instanceof EmptyResponseBodyError ||
    caught instanceof NoContentGeneratedError
  ) {
    return "That provider returned no answer. Check the model id and the base URL.";
  }
  if (!APICallError.isInstance(caught)) {
    return null;
  }
  return providerStatusSentence(caught.statusCode, caught.message);
}

export function providerStatusSentence(
  status: number | undefined,
  detail: string,
): string | null {
  if (status === 401 || status === 403) {
    return "That provider rejected the API key.";
  }
  if (status === 404) {
    return "That model id was not found at that provider.";
  }
  if (
    status === 402 ||
    /insufficient (?:quota|credit)|out of (?:credit|fund|budget)|exceeded your current quota|credit balance/i.test(
      detail,
    )
  ) {
    return "That provider is out of credits.";
  }
  if (status === 429) {
    return "That provider is rate-limited or out of credits. Try again shortly.";
  }
  if (status === 408 || (status !== undefined && status >= 500)) {
    return "That provider could not be reached. Try again shortly.";
  }
  return null;
}

export function readJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```[a-z]*/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
