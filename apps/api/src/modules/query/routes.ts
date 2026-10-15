import { Hono } from "hono";
import { schema } from "@heptadec/db";
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
import { engineOf } from "../data-source/contracts";
import { savedConnection, storedFromRow } from "../data-source/connection";
import { explainPostgresQuery } from "./postgres";
import { runnerOf } from "./runners";
import type { IExplainResponse } from "./contracts";

const { dataSource } = schema;

export function queryRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();
  routes.post("/api/data-sources/:id/query", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "query", "create"))) {
      throw new ForbiddenException("Only owners and editors can run queries");
    }

    const source = await oneRow(organization.db, dataSource, c.req.param("id"), organization);
    if (source === undefined) {
      throw new NotFoundException("That data source does not exist");
    }

    const runner = runnerOf(engineOf(source));
    const body = await runner.run(
      await storedFromRow(source),
      await c.req.json(),
      source.readOnly,
    );
    return c.json(body);
  });
  routes.post("/api/data-sources/:id/explain", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "query", "create"))) {
      throw new ForbiddenException("Only owners and editors can explain queries");
    }

    const source = await oneRow(organization.db, dataSource, c.req.param("id"), organization);
    if (source === undefined) {
      throw new NotFoundException("That data source does not exist");
    }
    // The gate the client was given, read back from the catalog rather than
    // written out a second time: if the two could disagree, a source could
    // offer a button the server always refuses.
    if (!engineOf(source).supportsExplain) {
      throw new BadRequestException(
        `Explaining queries on ${engineOf(source).name} is not available yet`,
      );
    }

    const sql = readString(
      readBody(await c.req.json(), "A statement is required"),
      "sql",
      "A statement is required",
    );

    const body: IExplainResponse = {
      plan: await explainPostgresQuery(await savedConnection(source), sql),
    };
    return c.json(body);
  });

  return routes;
}
