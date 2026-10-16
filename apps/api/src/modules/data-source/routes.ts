import {
  Hono,
} from "hono";
import {
  and,
  eq,
} from "drizzle-orm";
import {
  schema,
} from "@heptadec/db";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import {
  readBody,
} from "../../common/http/body";
import {
  activeOrganization,
} from "../../common/session/current-organization";
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  BadGatewayException,
} from "../../common/exceptions";
import {
  can,
} from "../rbac/authorize";
import {
  encryptSecret,
} from "./secret";
import {
  recordAudit,
  auditActor,
} from "../audit";
import {
  readConnection,
  readConnectionUpdate,
  storedFromInput,
  storedFromRow,
} from "./connection";
import {
  engineOf,
  kindOf,
} from "./contracts";
import {
  PREVIEW_DEFAULT_LIMIT,
  PREVIEW_MAX_LIMIT,
  listObjects,
  previewObject,
} from "./preview";
import {
  type ConnectionMode,
  type DataSourceKind,
  type ICreateDataSourceResponse,
  type IDataSource,
  type IDataSourceListResponse,
  type IDeleteDataSourceResponse,
  type IObjectsResponse,
  type IPreviewResponse,
  type ITestConnectionResponse,
  type IUpdateDataSourceResponse,
} from "./contracts";
import type { DataSourceRow } from "@heptadec/db";

const { dataSource } = schema;

function toIDataSource(row: DataSourceRow): IDataSource {
  return {
    id: row.id,
    organizationId: row.organizationId,
    kind: kindOf(row),
    name: row.name,
    host: row.host,
    port: row.port,
    socketPath: row.socketPath,
    connectionMode: row.connectionMode as ConnectionMode | null,
    database: row.database,
    schemaName: row.schemaName,
    options: row.options,
    username: row.username,
    hasSecret: row.secret !== null,
    hasCaCert: row.caCertificate !== null,
    hasClientCert: row.clientCertificate !== null,
    hasClientKey: row.clientKey !== null,
    hasToken: row.token !== null,
    readOnly: row.readOnly,
    sqlDialect: engineOf(row).sqlDialect,
    queryLanguage: engineOf(row).queryLanguage,
    canExplain: engineOf(row).supportsExplain,
    tooling: engineOf(row).supportsTooling,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function sealed(value: string | null): Promise<string | null> {
  return value === null ? null : encryptSecret(value);
}

export function dataSourceRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/data-sources", requireSession, async (c) => {
    const organization = activeOrganization(c);

    const rows = await organization.db
      .select()
      .from(dataSource)
      .where(organization.where(dataSource.organizationId))
      .orderBy(dataSource.createdAt);

    const body: IDataSourceListResponse = {
      dataSources: rows.map(toIDataSource),
    };
    return c.json(body);
  });

  routes.post("/api/data-sources", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dataSource", "create"))) {
      throw new ForbiddenException(
        "Only owners and editors can add data sources",
      );
    }

    const input = readConnection(
      readBody(await c.req.json(), "A data source is required"),
    );

    const now = new Date();
    const rows = await organization.db
      .insert(dataSource)
      .values({
        organizationId: organization.organizationId,
        kind: input.kind,
        name: input.name,
        host: input.host,
        port: input.port,
        socketPath: input.socketPath,
        connectionMode: input.connectionMode,
        database: input.database,
        schemaName: input.schemaName,
        options: input.options,
        username: input.username,
        secret: await sealed(input.password),
        caCertificate: await sealed(input.caCert),
        clientCertificate: await sealed(input.clientCert),
        clientKey: await sealed(input.clientKey),
        token: await sealed(input.token),
        readOnly: input.readOnly,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const body: ICreateDataSourceResponse = {
      dataSource: toIDataSource(rows[0]!),
    };
    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "data_source.created",
      targetKind: "data_source",
      targetId: rows[0]!.id,
      targetLabel: rows[0]!.name,
    });
    return c.json(body);
  });

  routes.patch("/api/data-sources/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dataSource", "update"))) {
      throw new ForbiddenException(
        "Only owners and editors can change data sources",
      );
    }

    const found = await organization.db
      .select()
      .from(dataSource)
      .where(
        and(
          eq(dataSource.id, c.req.param("id")),
          organization.where(dataSource.organizationId),
        ),
      );

    if (found.length === 0) {
      throw new NotFoundException("That data source does not exist");
    }
    const current = found[0]!;

    // The engine stays the one already stored: a source that points at a
    // different database engine is a different source, not an edit.
    const patch = readConnectionUpdate(
      readBody(await c.req.json(), "A data source is required"),
      current,
    );

    const updated = await organization.db
      .update(dataSource)
      .set({
        name: patch.name,
        readOnly: patch.readOnly,
        connectionMode: patch.connectionMode,
        host: patch.host,
        port: patch.port,
        socketPath: patch.socketPath,
        database: patch.database,
        schemaName: patch.schemaName,
        options: patch.options,
        username: patch.username,
        // A secret left out of the request keeps the one already sealed, since
        // the client is never shown it and so cannot send it back.
        ...(patch.password === undefined
          ? {}
          : { secret: await sealed(patch.password) }),
        ...(patch.caCert === undefined
          ? {}
          : { caCertificate: await sealed(patch.caCert) }),
        ...(patch.clientCert === undefined
          ? {}
          : { clientCertificate: await sealed(patch.clientCert) }),
        ...(patch.clientKey === undefined
          ? {}
          : { clientKey: await sealed(patch.clientKey) }),
        ...(patch.token === undefined
          ? {}
          : { token: await sealed(patch.token) }),
        updatedAt: new Date(),
      })
      .where(eq(dataSource.id, current.id))
      .returning();

    const body: IUpdateDataSourceResponse = {
      dataSource: toIDataSource(updated[0]!),
    };
    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "data_source.updated",
      targetKind: "data_source",
      targetId: updated[0]!.id,
      targetLabel: updated[0]!.name,
    });
    return c.json(body);
  });

  routes.delete("/api/data-sources/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dataSource", "delete"))) {
      throw new ForbiddenException(
        "Only owners and editors can remove data sources",
      );
    }

    const removed = await organization.db
      .delete(dataSource)
      .where(
        and(
          eq(dataSource.id, c.req.param("id")),
          organization.where(dataSource.organizationId),
        ),
      )
      .returning({ id: dataSource.id, name: dataSource.name });

    if (removed.length === 0) {
      throw new NotFoundException("That data source does not exist");
    }

    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "data_source.deleted",
      targetKind: "data_source",
      targetId: removed[0]!.id,
      targetLabel: removed[0]!.name,
    });

    const body: IDeleteDataSourceResponse = { removed: removed[0]!.id };
    return c.json(body);
  });

  routes.get("/api/data-sources/:id/objects", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dataSource", "query"))) {
      throw new ForbiddenException(
        "Only owners and editors can browse data sources",
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
    if (rows.length === 0) {
      throw new NotFoundException("That data source does not exist");
    }

    const body: IObjectsResponse = {
      objects: await reachable(async () =>
        listObjects(await storedFromRow(rows[0]!)),
      ),
    };
    return c.json(body);
  });

  routes.post("/api/data-sources/:id/preview", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dataSource", "query"))) {
      throw new ForbiddenException(
        "Only owners and editors can browse data sources",
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
    if (rows.length === 0) {
      throw new NotFoundException("That data source does not exist");
    }
    const row = rows[0]!;
    const kind = kindOf(row);

    const payload = readBody(await c.req.json(), "An object is required");
    const object = payload.object;
    if (typeof object !== "string" || object.length === 0 || object.length > 256) {
      throw new BadRequestException("An object is required");
    }
    const limit = readPreviewLimit(payload.limit);
    const query = readPreviewQuery(payload.query, kind);

    const stored = await storedFromRow(row);
    const objects = await reachable(() => listObjects(stored));
    const target = objects.find((entry) => entry.name === object);
    if (!target) {
      throw new NotFoundException("That object does not exist");
    }

    const body: IPreviewResponse = await reachable(() =>
      previewObject(
        stored,
        target,
        query,
        limit,
      ),
    );
    return c.json(body);
  });

  routes.post("/api/data-sources/test", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "dataSource", "create"))) {
      throw new ForbiddenException(
        "Only owners and editors can test connections",
      );
    }

    const input = readConnection(
      readBody(await c.req.json(), "A data source is required"),
    );

    try {
      const objects = await listObjects(storedFromInput(input));
      const body: ITestConnectionResponse = {
        ok: true,
        total: objects.length,
        sample: objects.slice(0, 10).map((object) => object.name),
      };
      return c.json(body);
    } catch {
      throw new BadGatewayException("The database could not be reached");
    }
  });

  return routes;
}

async function reachable<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch {
    throw new BadGatewayException("The database could not be reached");
  }
}

function readPreviewLimit(value: unknown): number {
  if (value === undefined || value === null) {
    return PREVIEW_DEFAULT_LIMIT;
  }
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > PREVIEW_MAX_LIMIT
  ) {
    throw new BadRequestException("The limit must be between 1 and 100");
  }
  return value;
}

function readPreviewQuery(value: unknown, kind: DataSourceKind): string {
  if (value === undefined || value === null) {
    return "*";
  }
  if (typeof value !== "string" || value.length === 0 || value.length > 500) {
    throw new BadRequestException("The search text is invalid");
  }
  if (kind !== "quickwit") {
    throw new BadRequestException("Only Quickwit searches take a query");
  }
  return value;
}
