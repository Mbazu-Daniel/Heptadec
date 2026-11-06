import { and, eq } from "drizzle-orm";
import {
  dataSource,
  type DataSourceRow,
} from "@heptadec/db";
import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from "../../common/exceptions/index";
import { driverFailure } from "../../common/driver-error";
import type { IOrganizationScope } from "../../common/session/current-organization";
import { encryptSecret } from "./secret";
import {
  readConnectionUpdate,
  storedFromInput,
  storedFromRow,
} from "./connection";
import { engineFrom, engineOf, kindOf } from "./engines";
import {
  PREVIEW_DEFAULT_LIMIT,
  PREVIEW_MAX_LIMIT,
  listObjects,
  previewObject,
} from "./preview";
import type {
  ConnectionMode,
  DataSourceKind,
  IDataSource,
  IDataSourceListResponse,
  IObjectsResponse,
  IPreviewResponse,
  ITestConnectionResponse,
} from "./contracts";
import type {
  ICreateDataSourceInput,
  IPreviewInput,
  IRemovedDataSource,
  ITestConnectionInput,
  IUpdateDataSourceInput,
} from "./types";

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

async function reachable<T>(attempt: () => Promise<T>): Promise<T> {
  try {
    return await attempt();
  } catch (caught) {
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

export async function listDataSources(
  organization: IOrganizationScope,
): Promise<IDataSourceListResponse> {
  const rows = await organization.db
    .select()
    .from(dataSource)
    .where(organization.where(dataSource.organizationId))
    .orderBy(dataSource.createdAt);

  const body: IDataSourceListResponse = {
    dataSources: rows.map(toIDataSource),
  };
  return body;
}

export async function createDataSource(
  organization: IOrganizationScope,
  input: ICreateDataSourceInput,
): Promise<IDataSource> {
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

  return toIDataSource(rows[0]!);
}

export async function updateDataSource(
  organization: IOrganizationScope,
  id: string,
  input: IUpdateDataSourceInput,
): Promise<IDataSource> {
  const found = await organization.db
    .select()
    .from(dataSource)
    .where(
      and(
        eq(dataSource.id, id),
        organization.where(dataSource.organizationId),
      ),
    );

  if (found.length === 0) {
    throw new NotFoundException("That data source does not exist");
  }
  const current = found[0]!;

  // The engine stays the one already stored: a source that points at a
  // different database engine is a different source, not an edit.
  const patch = readConnectionUpdate(input.body, current);

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

  return toIDataSource(updated[0]!);
}

export async function deleteDataSource(
  organization: IOrganizationScope,
  id: string,
): Promise<IRemovedDataSource> {
  const removed = await organization.db
    .delete(dataSource)
    .where(
      and(
        eq(dataSource.id, id),
        organization.where(dataSource.organizationId),
      ),
    )
    .returning({ id: dataSource.id, name: dataSource.name });

  if (removed.length === 0) {
    throw new NotFoundException("That data source does not exist");
  }

  return { id: removed[0]!.id, name: removed[0]!.name };
}

export async function listDataSourceObjects(
  organization: IOrganizationScope,
  id: string,
): Promise<IObjectsResponse> {
  const rows = await organization.db
    .select()
    .from(dataSource)
    .where(
      and(
        eq(dataSource.id, id),
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
  return body;
}

export async function previewDataSourceObject(
  organization: IOrganizationScope,
  id: string,
  input: IPreviewInput,
): Promise<IPreviewResponse> {
  const rows = await organization.db
    .select()
    .from(dataSource)
    .where(
      and(
        eq(dataSource.id, id),
        organization.where(dataSource.organizationId),
      ),
    )
    .limit(1);
  if (rows.length === 0) {
    throw new NotFoundException("That data source does not exist");
  }
  const row = rows[0]!;
  const kind = kindOf(row);

  const object = input.object;
  if (typeof object !== "string" || object.length === 0 || object.length > 256) {
    throw new BadRequestException("An object is required");
  }
  const limit = readPreviewLimit(input.limit);
  const query = readPreviewQuery(input.query, kind);

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
  return body;
}

export async function testDataSourceConnection(
  organization: IOrganizationScope,
  input: ITestConnectionInput,
): Promise<ITestConnectionResponse> {
  const objects = await reachable(() => listObjects(storedFromInput(input)));
  const body: ITestConnectionResponse = {
    ok: true,
    total: objects.length,
    sample: objects.slice(0, 10).map((object) => object.name),
  };
  return body;
}
