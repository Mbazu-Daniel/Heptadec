import { Hono } from "hono";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  activeOrganization,
  oneRow,
  type IRequestScope,
} from "../../common/session/current-organization";
import {
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions";
import { dataSource, type DataSourceRow } from "@heptadec/db";
import { can } from "../rbac/authorize";
import { queueStructure, readStructure } from "./structure";

/**
 * The structure of one source, and the state of the app's reading of it.
 *
 * A structure is read in the background and kept, so these routes answer from the
 * store: a source that has never been read says so as `pending` rather than making
 * the request wait on the user's database, and a source that refused says so as
 * `failed` with the reason, rather than 400ing the whole view.
 */
export function schemaRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/data-sources/:id/structure", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dataSource", "query"))) {
      throw new ForbiddenException(
        "Only owners and editors can read a source's structure",
      );
    }

    return c.json(
      await readStructure(
        organization.db,
        await requiredSource(organization, c.req.param("id")),
        new Date(),
        c.env.waitUntil,
      ),
    );
  });

  // Reading a source again is what a user asks for when the stored answer is
  // older than they want, or the source refused and stopped on its own.
  routes.post(
    "/api/data-sources/:id/structure/refresh",
    requireSession,
    async (c) => {
      const organization = activeOrganization(c);

      if (!(await can(organization.db, c.req.raw.headers, "dataSource", "query"))) {
        throw new ForbiddenException(
          "Only owners and editors can read a source's structure",
        );
      }

      const source = await requiredSource(organization, c.req.param("id"));
      const now = new Date();
      await queueStructure(organization.db, source, now, c.env.waitUntil);

      return c.json(
        await readStructure(organization.db, source, now, c.env.waitUntil),
      );
    },
  );

  return routes;
}

async function requiredSource(
  organization: IRequestScope,
  id: string,
): Promise<DataSourceRow> {
  const source = await oneRow(organization.db, dataSource, id, organization);
  if (source === undefined) {
    throw new NotFoundException("That data source does not exist");
  }
  return source;
}
