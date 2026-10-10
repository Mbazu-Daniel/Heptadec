import { Hono } from "hono";
import { db, schema } from "@heptadec/db";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { readBody, readString } from "../../common/http/body";
import { activeOrganization, oneRow } from "../../common/session/current-organization";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions";
import { can } from "../rbac/authorize";
import {
  ENGINE_SPECS,
  type DataSourceKind,
} from "../data-source/contracts";
import { savedConnection, storedFromRow } from "../data-source/connection";
import { explainPostgresQuery, runPostgresQuery } from "./postgres";
import { runRedisQuery } from "./redis";
import type {
  IExplainResponse,
  IQueryResponse,
  IRedisQueryResponse,
} from "./contracts";

const { dataSource } = schema;

export function queryRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();
  routes.post("/api/data-sources/:id/query", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(c.req.raw.headers, "query", "create"))) {
      throw new ForbiddenException("Only owners and editors can run queries");
    }

    const source = await oneRow(dataSource, c.req.param("id"), organization);
    if (source === undefined) {
      throw new NotFoundException("That data source does not exist");
    }

    const engine = ENGINE_SPECS[source.kind as DataSourceKind];

    if (engine.queryLanguage === "command") {
      const command = readString(
        readBody(await c.req.json(), "A command is required"),
        "command",
        "A Redis command is required",
      );
      const body: IRedisQueryResponse = await runRedisQuery(
        storedFromRow(source),
        command,
      );
      return c.json(body);
    }

    if (engine.queryLanguage === "sql") {
      const sql = readString(
        readBody(await c.req.json(), "A statement is required"),
        "sql",
        "A statement is required",
      );
      const body: IQueryResponse = await runPostgresQuery(
        savedConnection(source),
        sql,
      );
      return c.json(body);
    }

    throw new BadRequestException(
      `Running queries on ${engine.name} is not available yet`,
    );
  });
  routes.post("/api/data-sources/:id/explain", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(c.req.raw.headers, "query", "create"))) {
      throw new ForbiddenException("Only owners and editors can explain queries");
    }

    const source = await oneRow(dataSource, c.req.param("id"), organization);
    if (source === undefined) {
      throw new NotFoundException("That data source does not exist");
    }
    if (source.kind !== "postgres") {
      throw new BadRequestException(
        `Explaining queries on ${source.kind} is not available yet`,
      );
    }

    const sql = readString(
      readBody(await c.req.json(), "A statement is required"),
      "sql",
      "A statement is required",
    );

    const body: IExplainResponse = {
      plan: await explainPostgresQuery(savedConnection(source), sql),
    };
    return c.json(body);
  });

  return routes;
}
