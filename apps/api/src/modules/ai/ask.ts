import type { IEngineSpec, QueryLanguage } from "../data-source/contracts";
import type { IStoredConnection } from "../data-source/connection";
import { introspectSchema } from "../schema/introspect";
import { readMongoPipeline } from "../query/mongo";
import { readSearchStatement } from "../query/quickwit";
import {
  mongoInstructions,
  queryInstructions,
  quickwitInstructions,
  redisInstructions,
} from "./instructions";
import { quickwitContext, redisContext, schemaContext } from "./context";
import type { IAskStyle, IGeneratedQuery, IQueryDraft } from "./types";

const REFUSED: IQueryDraft = {
  sql: null,
  pipeline: null,
  command: null,
  search: null,
};

interface IAskStyleSpec {
  instructions(engine: IEngineSpec): string | null;
  context(sourceId: string, stored: IStoredConnection): Promise<string>;
  readDraft(cleaned: string): IQueryDraft | null;
}

const schemaSourceContext = async (
  sourceId: string,
  stored: IStoredConnection,
): Promise<string> =>
  schemaContext({ sourceId, ...(await introspectSchema(stored)) });

const readJsonAnswer = <T>(text: string, read: (value: unknown) => T): T | null => {
  try {
    return read(JSON.parse(text));
  } catch {
    return null;
  }
};

const ASK_STYLES: Record<QueryLanguage, IAskStyleSpec> = {
  sql: {
    instructions: (engine) =>
      engine.sqlDialect === null ? null : queryInstructions(engine.sqlDialect),
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

const readAnswer = (
  text: string,
  readDraft: (cleaned: string) => IQueryDraft | null,
): IGeneratedQuery => {
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
