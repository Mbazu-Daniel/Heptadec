import type {
  IEngineSpec,
  QueryLanguage,
} from "../data-source/contracts";
import type { IStoredConnection } from "../data-source/connection";
import { introspectSchema } from "../schema/introspect";
import { readMongoPipeline } from "../query/mongo";
import { readSearchStatement } from "../query/quickwit";
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

/** The statement part of an answer, before the outcome is decided. */
type IDraft = Pick<IGeneratedQuery, "sql" | "pipeline" | "command" | "search">;

const REFUSED: IDraft = {
  sql: null,
  pipeline: null,
  command: null,
  search: null,
};

/** How the ask path treats one query language: the instructions the model is
 * given, where the context half of the prompt comes from, and how its words
 * are read back as a statement. One row per language — a fifth queryable
 * language is one row here, beside the run path's own runner row. */
export interface IAskStyle {
  language: QueryLanguage;
  instructions: string;
  /** The context half of the prompt, read from the actual source. */
  context(sourceId: string, stored: IStoredConnection): Promise<string>;
  /** The answer as the model wrote it, refused or unreadable included. */
  readAnswer(text: string): IGeneratedQuery;
}

const ASK_STYLES: Record<
  QueryLanguage,
  {
    instructions(engine: IEngineSpec): string | null;
    context(sourceId: string, stored: IStoredConnection): Promise<string>;
    /** null means the answer arrived in a shape the server will not run. */
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

/** The style for asking this engine a question, or null when the engine
 * cannot be asked. */
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

/** Read a statement the model wrote, through the rules its language runs:
 * a refusal is a refusal, an unreadable shape is its own outcome, and
 * everything else becomes the draft the ask route stores and hands over. */
function readAnswer(
  text: string,
  readDraft: (cleaned: string) => IDraft | null,
): IGeneratedQuery {
  const cleaned = text
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  if (cleaned === "" || cleaned.toUpperCase().startsWith("UNANSWERABLE")) {
    return { ...REFUSED, outcome: "declined" };
  }
  const draft = readDraft(cleaned);
  return draft === null
    ? { ...REFUSED, outcome: "unreadable" }
    : { ...draft, outcome: "answered" };
}

/**
 * Read a statement the model wrote as JSON, through the same reader a browser's
 * would pass through — so a search or a pipeline the model produced is held to
 * exactly the rules one typed by hand is, rather than to a second copy of them
 * that can drift.
 */
function readJsonAnswer<T>(text: string, read: (value: unknown) => T): T | null {
  try {
    return read(JSON.parse(text));
  } catch {
    return null;
  }
}
