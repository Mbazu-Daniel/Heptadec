import type {
  IEngineSpec,
  QueryLanguage,
} from "../data-source/contracts";
import type { IStoredConnection } from "../data-source/connection";
import { introspectSchema } from "../schema/introspect";
import { readMongoPipeline } from "../query/engines/mongo";
import { readSearchStatement } from "../query/engines/quickwit";
import type { IMongoPipeline, ISearchStatement } from "../query/contracts";
import { quickwitContext, redisContext, schemaContext } from "./context";
import {
  mongoInstructions,
  queryInstructions,
  quickwitInstructions,
  redisInstructions,
} from "./instructions";

export interface IGeneratedQuery {
  sql: string | null;
  pipeline: IMongoPipeline | null;
  command: string | null;
  search: ISearchStatement | null;
  outcome: "answered" | "declined" | "empty" | "unreadable";
}

type IDraft = Pick<IGeneratedQuery, "sql" | "pipeline" | "command" | "search">;

const REFUSED: IDraft = {
  sql: null,
  pipeline: null,
  command: null,
  search: null,
};

export interface IAskStyle {
  language: QueryLanguage;
  instructions: string;
  context(sourceId: string, stored: IStoredConnection): Promise<string>;
  readAnswer(text: string): IGeneratedQuery;
}

const ASK_STYLES: Record<
  QueryLanguage,
  {
    instructions(engine: IEngineSpec): string | null;
    context(sourceId: string, stored: IStoredConnection): Promise<string>;
    readDraft(cleaned: string): IDraft | null;
  }
> = {
  sql: {
    instructions: (engine) =>
      engine.sqlDialect === null
        ? null
        : queryInstructions(engine.sqlDialect),
    context: schemaSourceContext,
    readDraft: (cleaned) => ({ ...REFUSED, sql: cleaned }),
  },
  command: {
    instructions: () => redisInstructions,
    context: (_sourceId, stored) => redisContext(stored),
    readDraft: (cleaned) => ({ ...REFUSED, command: cleaned }),
  },
  pipeline: {
    instructions: () => mongoInstructions,
    context: schemaSourceContext,
    readDraft: (cleaned) => {
      const pipeline = readJsonAnswer(cleaned, readMongoPipeline);
      return pipeline === null ? null : { ...REFUSED, pipeline };
    },
  },
  search: {
    instructions: () => quickwitInstructions,
    context: (_sourceId, stored) => quickwitContext(stored),
    readDraft: (cleaned) => {
      const search = readJsonAnswer(cleaned, readSearchStatement);
      return search === null ? null : { ...REFUSED, search };
    },
  },
};

export function askStyleOf(engine: IEngineSpec): IAskStyle | null {
  const language = engine.queryLanguage;
  if (language === null) {
    return null;
  }
  const spec = ASK_STYLES[language];
  const instructions = spec.instructions(engine);
  if (instructions === null) {
    return null;
  }
  return {
    language,
    instructions,
    context: (sourceId, stored) => spec.context(sourceId, stored),
    readAnswer: (text) => readAnswer(text, spec.readDraft),
  };
}

async function schemaSourceContext(
  sourceId: string,
  stored: IStoredConnection,
): Promise<string> {
  return schemaContext({ sourceId, ...(await introspectSchema(stored)) });
}

function readAnswer(
  text: string,
  readDraft: (cleaned: string) => IDraft | null,
): IGeneratedQuery {
  const cleaned = text
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (cleaned === "") {
    return { ...REFUSED, outcome: "empty" };
  }
  if (cleaned.toUpperCase().startsWith("UNANSWERABLE")) {
    return { ...REFUSED, outcome: "declined" };
  }
  const draft = readDraft(cleaned);
  return draft === null
    ? { ...REFUSED, outcome: "unreadable" }
    : { ...draft, outcome: "answered" };
}

function readJsonAnswer<T>(text: string, read: (value: unknown) => T): T | null {
  try {
    return read(JSON.parse(text));
  } catch {
    return null;
  }
}
