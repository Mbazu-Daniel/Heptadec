import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { dataSource, type HeptadecDatabase } from "@heptadec/db";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import {
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions";
import { storedFromRow } from "../data-source/connection";
import { can } from "../rbac/authorize";
import { introspectSchema } from "./introspect";
import type { ISchemaResponse } from "./contracts";

export function schemaRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();
  routes.get("/api/data-sources/:id/schema", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dataSource", "query"))) {
      throw new ForbiddenException(
        "Only owners and editors can read a source's structure",
      );
    }

    const rows = await organization.db
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

    const introspected = await introspectSchema(await storedFromRow(source));
    const body: ISchemaResponse = { sourceId: source.id, ...introspected };
    return c.json(body);
  });

  return routes;
}
