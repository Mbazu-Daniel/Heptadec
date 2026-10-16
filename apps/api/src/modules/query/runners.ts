import { BadRequestException } from "../../common/exceptions";
import { readBody, readString } from "../../common/http/body";
import type { IEngineSpec, QueryLanguage } from "../data-source/contracts";
import type { IStoredConnection } from "../data-source/connection";
import type { IQueryResponse, IRedisQueryResponse } from "./contracts";
import { runSqlQuery } from "./sql";
import { readMongoPipeline, runMongoQuery } from "./mongo";
import { runRedisQuery } from "./redis";
import { readSearchStatement, runSearchQuery } from "./quickwit";

/**
 * What one language's Run answers with: the Grid every Run is, plus whatever
 * else that language's result carries. Redis reports how long it took and no
 * column types; the rest report both.
 */
export type RunResult = IQueryResponse | IRedisQueryResponse;

/**
 * The seam one language is run through.
 *
 * A statement crosses the wire untrusted, so reading it is part of running it
 * and belongs beside it: each language below reads its own body and then
 * executes, rather than leaving the reading to the route and the running to
 * this module. That is what lets a route ask "which language is this engine"
 * once, instead of carrying a branch per language that knows where in the body
 * to reach and what to do with what it finds.
 */
export interface ILanguageRunner {
  run(connection: IStoredConnection, body: unknown): Promise<RunResult>;
}

/**
 * Every language, keyed by the language itself. A language with no runner is a
 * missing key here and so a compile error, rather than an engine that is listed
 * throughout the app and cannot be run.
 */
const RUNNERS = {
  sql: {
    run: (connection, body) =>
      runSqlQuery(
        connection,
        readString(readBody(body, "A statement is required"), "sql", "A statement is required"),
      ),
  },
  command: {
    run: (connection, body) =>
      runRedisQuery(
        connection,
        readString(readBody(body, "A command is required"), "command", "A Redis command is required"),
      ),
  },
  pipeline: {
    run: (connection, body) =>
      runMongoQuery(
        connection,
        readMongoPipeline(readBody(body, "A pipeline is required").mongo),
      ),
  },
  search: {
    run: (connection, body) =>
      runSearchQuery(
        connection,
        readSearchStatement(readBody(body, "A search is required").search),
      ),
  },
} as const satisfies Record<QueryLanguage, ILanguageRunner>;

/**
 * The runner an engine speaks through, or a refusal naming the engine. Every Run
 * the app makes arrives through here, so no caller carries its own list of the
 * languages that exist — the list is this record's keys, and the compiler holds
 * it to all of them.
 */
export function runnerOf(engine: IEngineSpec): ILanguageRunner {
  const language = engine.queryLanguage;
  if (language === null) {
    throw new BadRequestException(
      `Running queries on ${engine.name} is not available yet`,
    );
  }
  return RUNNERS[language];
}