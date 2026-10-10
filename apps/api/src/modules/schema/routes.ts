import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@heptadec/db";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions";
import { savedConnection } from "../data-source/connection";
import { can } from "../rbac/authorize";
import { introspectPostgres } from "./postgres";
import type { ISchemaResponse } from "./contracts";

const { dataSource } = schema;

export function schemaRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();
  routes.get("/api/data-sources/:id/schema", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(c.req.raw.headers, "dataSource", "query"))) {
      throw new ForbiddenException(
        "Only owners and editors can read a source's structure",
      );
    }

    const rows = await db
      .select()
      .from(dataSource)
      .where(
        and(
          eq(dataSource.id, c.req.param("id")),
          organization.where(dataSource.organizationId),
        ),
      )
      .limit(1);

    const source = rows[0];
    if (source === undefined) {
      throw new NotFoundException("That data source does not exist");
    }
    if (source.kind !== "postgres") {
      throw new BadRequestException(
        `Reading structure is only available for postgres, not ${source.kind}`,
      );
    }

    const introspected = await introspectPostgres(savedConnection(source));
    const body: ISchemaResponse = { sourceId: source.id, ...introspected };
    return c.json(body);
  });

  return routes;
}
