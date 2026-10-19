import { BadRequestException } from "../../common/exceptions";
import { readBody, readString } from "../../common/http/body";
import type { IEngineSpec, QueryLanguage } from "../data-source/contracts";
import type { IStoredConnection } from "../data-source/connection";
import type { IQueryResponse, IRedisQueryResponse } from "./contracts";
import { runSqlQuery } from "./sql";
import { readMongoPipeline, runMongoQuery } from "./mongo";
import { runRedisQuery } from "./redis";
import { readSearchStatement, runSearchQuery } from "./quickwit";

export type RunResult = IQueryResponse | IRedisQueryResponse;

export interface ILanguageRunner {
  run(
    connection: IStoredConnection,
    body: unknown,
    readOnly: boolean,
  ): Promise<RunResult>;
}

const RUNNERS = {
  sql: {
    run: (connection, body, readOnly) =>
      runSqlQuery(
        connection,
        readString(readBody(body, "A statement is required"), "sql", "A statement is required"),
        readOnly,
      ),
  },
  command: {
    run: (connection, body, readOnly) =>
      runRedisQuery(
        connection,
        readString(readBody(body, "A command is required"), "command", "A Redis command is required"),
        readOnly,
      ),
  },
  pipeline: {
    run: (connection, body, readOnly) =>
      runMongoQuery(
        connection,
        readMongoPipeline(readBody(body, "A pipeline is required").mongo),
        readOnly,
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

export function runnerOf(engine: IEngineSpec): ILanguageRunner {
  const language = engine.queryLanguage;
  if (language === null) {
    throw new BadRequestException(
      `Running queries on ${engine.name} is not available yet`,
    );
  }
  return RUNNERS[language];
}