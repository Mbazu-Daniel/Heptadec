import { streamText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { AiProviderRow } from "@heptadec/db";
import { decryptSecret } from "../data-source/secret";
import type { QueryLanguage } from "../data-source/contracts";
import { readMongoPipeline } from "../query/mongo";
import { readSearchStatement } from "../query/quickwit";
import type { IMongoPipeline, ISearchStatement } from "../query/contracts";
import { providerSpec } from "./catalog";

const ANSWER_TIMEOUT_MS = 60_000;

const PLAN_TIMEOUT_MS = 180_000;

export interface IGeneratedQuery {
  sql: string | null;
  pipeline: IMongoPipeline | null;
  /** A Redis command, which is what that engine is asked for instead of SQL. */
  command: string | null;
  /** A Quickwit search, which is what a search source is asked for. */
  search: ISearchStatement | null;
  /**
   * What came back, in the three shapes it can take.
   *
   * A model that declines is not a model that answers wrongly, and telling the
   * two apart is the difference between "that question has no answer in your
   * data" and "try asking again" — so a statement that arrived in a shape the
   * server will not run is reported as its own outcome rather than folded into
   * a refusal.
   */
  outcome: "answered" | "declined" | "unreadable";
}

const REFUSED = {
  sql: null,
  pipeline: null,
  command: null,
  search: null,
} as const;

async function* streamWith(
  row: AiProviderRow,
  system: string,
  user: string,
  timeoutMs: number,
): AsyncGenerator<string, void, undefined> {
  const spec = providerSpec(row.provider);
  if (spec === null) {
    throw new Error(`Unknown AI provider ${row.provider}`);
  }
  const baseUrl = spec.needsBaseUrl ? row.baseUrl : spec.baseUrl;
  if (baseUrl === null || baseUrl === "") {
    throw new Error(`${spec.label} needs a base URL`);
  }

  const model = createOpenAICompatible({
    name: spec.id,
    apiKey: await decryptSecret(row.apiKey),
    baseURL: baseUrl,
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

export function readStatement(
  text: string,
  queryLanguage: QueryLanguage,
): IGeneratedQuery {
  const cleaned = text
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (cleaned === "" || cleaned.toUpperCase().startsWith("UNANSWERABLE")) {
    return { ...REFUSED, outcome: "declined" };
  }

  switch (queryLanguage) {
    case "pipeline": {
      const pipeline = readModelJson(cleaned, readMongoPipeline);
      return pipeline === null
        ? { ...REFUSED, outcome: "unreadable" }
        : { ...REFUSED, pipeline, outcome: "answered" };
    }
    case "command":
      return { ...REFUSED, command: cleaned, outcome: "answered" };
    case "search": {
      const search = readModelJson(cleaned, readSearchStatement);
      return search === null
        ? { ...REFUSED, outcome: "unreadable" }
        : { ...REFUSED, search, outcome: "answered" };
    }
    case "sql":
      return { ...REFUSED, sql: cleaned, outcome: "answered" };
  }
}

/**
 * Read a statement the model wrote as JSON, through the same reader a browser's
 * would pass through — so a search or a pipeline the model produced is held to
 * exactly the rules one typed by hand is, rather than to a second copy of them
 * that can drift. `null` means the answer arrived in a shape the server will not
 * run, which is a different thing from the model declining to answer.
 */
function readModelJson<T>(text: string, read: (value: unknown) => T): T | null {
  try {
    return read(JSON.parse(text));
  } catch {
    return null;
  }
}
