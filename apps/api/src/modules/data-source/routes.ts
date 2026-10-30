import {
  Hono,
} from "hono";
import {
  and,
  eq,
} from "drizzle-orm";
import {
  dataSource,
  dataSourceStructure,
  type HeptadecDatabase,
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
  ApiException,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  BadGatewayException,
} from "../../common/exceptions";
import { driverFailure } from "../../common/driver-error";
import {
  can,
} from "../rbac/authorize";
import {
  encryptSecret,
} from "./secret";
import { recordAudit } from "../audit";
import {
  readConnection,
  readConnectionUpdate,
  storedFromInput,
  storedFromRow,
} from "./connection";
import { engineFrom, engineOf, kindOf } from "./engines";
import {
  queueStructure,
  readStructure,
  structuresOf,
} from "../schema/structure";
import type { IStructureSummary } from "./contracts";
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
  type IPreviewResponse,
  type ITestConnectionResponse,
  type IUpdateDataSourceResponse,
} from "./contracts";
import type { DataSourceRow } from "@heptadec/db";

function toIDataSource(
  row: DataSourceRow,
  structures: Map<string, IStructureSummary>,
): IDataSource {
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
    structure: structures.get(row.id) ?? null,
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

    const structures = await structuresOf(
      organization.db,
      organization.organizationId,
      new Date(),
    );

    const body: IDataSourceListResponse = {
      dataSources: rows.map((row) => toIDataSource(row, structures)),
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

    const created = rows[0]!;

    // The source is saved and the answer is on its way; reading its structure is
    // handed to the background rather than done inside this request.
    await queueStructure(organization.db, created, now, c.env.waitUntil);

    const structures = await structuresOf(
      organization.db,
      organization.organizationId,
      now,
    );

    const body: ICreateDataSourceResponse = {
      dataSource: toIDataSource(created, structures),
    };
    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "data_source.created",
      targetKind: "data_source",
      targetId: created.id,
      targetLabel: created.name,
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

    const patch = readConnectionUpdate(
      readBody(await c.req.json(), "A data source is required"),
      current,
    );

    const now = new Date();
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
        updatedAt: now,
      })
      .where(eq(dataSource.id, current.id))
      .returning();

    // Editing a source is the moment its structure may have moved, so the app
    // reads it again in the background rather than answering from what it knew.
    const patched = updated[0]!;
    await queueStructure(organization.db, patched, now, c.env.waitUntil);

    const structures = await structuresOf(
      organization.db,
      organization.organizationId,
      now,
    );

    const body: IUpdateDataSourceResponse = {
      dataSource: toIDataSource(patched, structures),
    };
    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "data_source.updated",
      targetKind: "data_source",
      targetId: patched.id,
      targetLabel: patched.name,
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

    // What the app learned about the source goes with it.
    await organization.db
      .delete(dataSourceStructure)
      .where(eq(dataSourceStructure.dataSourceId, removed[0]!.id));

    await recordAudit(c, {
      organizationId: organization.organizationId,
      event: "data_source.deleted",
      targetKind: "data_source",
      targetId: removed[0]!.id,
      targetLabel: removed[0]!.name,
    });

    const body: IDeleteDataSourceResponse = { removed: removed[0]!.id };
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

    // Which objects there are to preview is structure, so it comes from the
    // store; only the rows inside one of them are read live.
    const { objects } = await reachable(() =>
      readStructure(organization.db, row, new Date(), c.env.waitUntil),
    );
    const target = objects.find((entry) => entry.name === object);
    if (target === undefined) {
      throw new NotFoundException("That object does not exist");
    }

    const body: IPreviewResponse = await reachable(async () =>
      previewObject(await storedFromRow(row), target, query, limit),
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

    const objects = await reachable(() => listObjects(storedFromInput(input)));
    const body: ITestConnectionResponse = {
      ok: true,
      total: objects.length,
      sample: objects.slice(0, 10).map((object) => object.name),
    };
    return c.json(body);
  });

  return routes;
}

async function reachable<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (caught) {
    if (caught instanceof ApiException) {
      throw caught;
    }
    throw new BadGatewayException(
      driverFailure(caught, "reach that data source") ??
        "The database could not be reached",
    );
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
  if (engineFrom(kind).queryLanguage !== "search") {
    throw new BadRequestException("Only search sources take a query");
  }
  return value;
}
