import type { DataSourceRow, HeptadecDatabase } from "@heptadec/db";
import type {
  IEngineSpec,
  QueryLanguage,
} from "../data-source/contracts";
import { storedFromRow } from "../data-source/connection";
import { schemaForAsk } from "../schema/structure";
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
  command: string | null;
  search: ISearchStatement | null;
  outcome: "answered" | "declined" | "unreadable";
}

type IDraft = Pick<IGeneratedQuery, "sql" | "pipeline" | "command" | "search">;

const REFUSED: IDraft = {
  sql: null,
  pipeline: null,
  command: null,
  search: null,
};

/** What a question's context half is built from: the source it was asked about,
 * and the hand-off a background structure sync needs. A style that answers from
 * the app's store uses the row; a style that probes the live engine decrypts its
 * own connection. */
export interface IAskRequest {
  db: HeptadecDatabase;
  source: DataSourceRow;
  now: Date;
  waitUntil: (task: Promise<unknown>) => void;
}

/** How the ask path treats one query language: the instructions the model is
 * given, where the context half of the prompt comes from, and how its words
 * are read back as a statement. One row per language — a fifth queryable
 * language is one row here, beside the run path's own runner row. */
export interface IAskStyle {
  language: QueryLanguage;
  instructions: string;
  /** The context half of the prompt, read from the actual source. */
  context(request: IAskRequest): Promise<string>;
  /** The answer as the model wrote it, refused or unreadable included. */
  readAnswer(text: string): IGeneratedQuery;
}

const ASK_STYLES: Record<
  QueryLanguage,
  {
    instructions(engine: IEngineSpec): string | null;
    context(request: IAskRequest): Promise<string>;
    /** null means the answer arrived in a shape the server will not run. */
    readDraft(cleaned: string): IDraft | null;
  }
> = {
  sql: {
    instructions: (engine) =>
      engine.sqlDialect === null
        ? null
        : queryInstructions(engine.sqlDialect),
    context: storedSchemaContext,
    readDraft: (cleaned) => ({ ...REFUSED, sql: cleaned }),
  },
  command: {
    instructions: () => redisInstructions,
    context: async (request) =>
      redisContext(await storedFromRow(request.source)),
    readDraft: (cleaned) => ({ ...REFUSED, command: cleaned }),
  },
  pipeline: {
    instructions: () => mongoInstructions,
    context: storedSchemaContext,
    readDraft: (cleaned) => {
      const pipeline = readJsonAnswer(cleaned, readMongoPipeline);
      return pipeline === null ? null : { ...REFUSED, pipeline };
    },
  },
  search: {
    instructions: () => quickwitInstructions,
    context: async (request) =>
      quickwitContext(await storedFromRow(request.source)),
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
    context: spec.context,
    readAnswer: (text) => readAnswer(text, spec.readDraft),
  };
}

async function storedSchemaContext(request: IAskRequest): Promise<string> {
  return schemaContext(
    await schemaForAsk(
      request.db,
      request.source,
      request.now,
      request.waitUntil,
    ),
  );
}

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

function readJsonAnswer<T>(text: string, read: (value: unknown) => T): T | null {
  try {
    return read(JSON.parse(text));
  } catch {
    return null;
  }
}
