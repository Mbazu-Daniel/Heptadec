import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { readBody } from "../../common/http/body";
import { activeOrganization } from "../../common/session/current-organization";
import { ForbiddenException } from "../../common/exceptions/index";
import { can } from "../rbac/authorize";
import { recordAudit } from "../audit/index";
import { readConnection } from "./connection";
import type {
  ICreateDataSourceResponse,
  IDeleteDataSourceResponse,
  IUpdateDataSourceResponse,
} from "./contracts";
import {
  createDataSource,
  deleteDataSource,
  listDataSourceObjects,
  listDataSources,
  previewDataSourceObject,
  testDataSourceConnection,
  updateDataSource,
} from "./data-source.service";

export async function listDataSourcesHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);

  return c.json(await listDataSources(organization));
}

export async function createDataSourceHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dataSource", "create"))) {
    throw new ForbiddenException(
      "Only owners and editors can add data sources",
    );
  }

  const input = readConnection(
    readBody(await c.req.json(), "A data source is required"),
  );

  const created = await createDataSource(organization, input);

  const body: ICreateDataSourceResponse = {
    dataSource: created,
  };
  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "data_source.created",
    targetKind: "data_source",
    targetId: created.id,
    targetLabel: created.name,
  });
  return c.json(body);
}

export async function updateDataSourceHandler(c: Context<IAuthVars, "/api/v1/organization/:organizationId/data-sources/:id">) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dataSource", "update"))) {
    throw new ForbiddenException(
      "Only owners and editors can change data sources",
    );
  }

  const updated = await updateDataSource(
    organization,
    c.req.param("id"),
    { body: readBody(await c.req.json(), "A data source is required") },
  );

  const body: IUpdateDataSourceResponse = {
    dataSource: updated,
  };
  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "data_source.updated",
    targetKind: "data_source",
    targetId: updated.id,
    targetLabel: updated.name,
  });
  return c.json(body);
}

export async function deleteDataSourceHandler(c: Context<IAuthVars, "/api/v1/organization/:organizationId/data-sources/:id">) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dataSource", "delete"))) {
    throw new ForbiddenException(
      "Only owners and editors can remove data sources",
    );
  }

  const removed = await deleteDataSource(organization, c.req.param("id"));

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "data_source.deleted",
    targetKind: "data_source",
    targetId: removed.id,
    targetLabel: removed.name,
  });

  const body: IDeleteDataSourceResponse = { removed: removed.id };
  return c.json(body);
}

export async function listDataSourceObjectsHandler(c: Context<IAuthVars, "/api/v1/organization/:organizationId/data-sources/:id/objects">) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dataSource", "query"))) {
    throw new ForbiddenException(
      "Only owners and editors can browse data sources",
    );
  }

  const body = await listDataSourceObjects(organization, c.req.param("id"));
  return c.json(body);
}

export async function previewDataSourceObjectHandler(c: Context<IAuthVars, "/api/v1/organization/:organizationId/data-sources/:id/preview">) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dataSource", "query"))) {
    throw new ForbiddenException(
      "Only owners and editors can browse data sources",
    );
  }

  const payload = readBody(await c.req.json(), "An object is required");

  const body = await previewDataSourceObject(
    organization,
    c.req.param("id"),
    { object: payload.object, limit: payload.limit, query: payload.query },
  );
  return c.json(body);
}

export async function testDataSourceConnectionHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "dataSource", "create"))) {
    throw new ForbiddenException(
      "Only owners and editors can test connections",
    );
  }

  const input = readConnection(
    readBody(await c.req.json(), "A data source is required"),
  );

  const body = await testDataSourceConnection(organization, input);
  return c.json(body);
}
