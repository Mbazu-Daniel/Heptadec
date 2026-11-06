import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { readBody, readOptionalString, readString } from "../../common/http/body";
import { activeOrganization } from "../../common/session/current-organization";
import {
  ForbiddenException,
} from "../../common/exceptions/index";
import { can } from "../rbac/authorize";
import { recordAudit } from "../audit/index";
import {
  createSavedQueryForSource,
  deleteSavedQuery,
  listQueryVersions,
  listSavedQueries,
  listSavedQueriesForSource,
  recordSavedQueryRun,
  restoreSavedQuery,
  updateSavedQuery,
} from "./saved-query.service";

const MAX_NAME = 120;

const MAX_SQL = 20_000;

export async function listSavedQueriesHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);

  const body = await listSavedQueries(organization);
  return c.json(body);
}

export async function listSavedQueriesForSourceHandler(c: Context<IAuthVars, "/api/v1/organization/:organizationId/data-sources/:id/saved-queries">) {
  const organization = activeOrganization(c);

  const body = await listSavedQueriesForSource(organization, c.req.param("id"));
  return c.json(body);
}

export async function createSavedQueryHandler(c: Context<IAuthVars, "/api/v1/organization/:organizationId/data-sources/:id/saved-queries">) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "query", "create"))) {
    throw new ForbiddenException("Only owners and editors can save queries");
  }

  const body = readBody(await c.req.json(), "A saved query is required");
  const name = readString(body, "name", "Give the query a name", MAX_NAME);
  const sql = readString(body, "sql", "Write the statement to save", MAX_SQL);

  const created = await createSavedQueryForSource(
    organization,
    { dataSourceId: c.req.param("id"), name, sql },
  );

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "saved_query.created",
    targetKind: "saved_query",
    targetId: created.savedQuery.id,
    targetLabel: created.savedQuery.name,
  });

  return c.json(created, 201);
}

export async function recordSavedQueryRunHandler(c: Context<IAuthVars, "/api/v1/organization/:organizationId/data-sources/:id/saved-queries/runs">) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "query", "create"))) {
    throw new ForbiddenException("Only owners and editors can save queries");
  }

  const body = readBody(await c.req.json(), "A statement is required");
  const sql = readString(body, "sql", "Write the statement to record", MAX_SQL);

  const result = await recordSavedQueryRun(
    organization,
    { dataSourceId: c.req.param("id"), sql },
  );

  return c.json(result.response, result.created ? 201 : 200);
}

export async function updateSavedQueryHandler(c: Context<IAuthVars, "/api/v1/organization/:organizationId/saved-queries/:id">) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "query", "update"))) {
    throw new ForbiddenException("Only owners and editors can edit queries");
  }

  const body = readBody(await c.req.json(), "An update is required");
  const name = readOptionalString(body, "name", "Give the query a name", MAX_NAME);
  const sql = readOptionalString(body, "sql", "Write the statement to save", MAX_SQL);

  const response = await updateSavedQuery(
    organization,
    { savedQueryId: c.req.param("id"), name, sql },
  );

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "saved_query.updated",
    targetKind: "saved_query",
    targetId: response.savedQuery.id,
    targetLabel: response.savedQuery.name,
  });

  return c.json(response);
}

export async function deleteSavedQueryHandler(c: Context<IAuthVars, "/api/v1/organization/:organizationId/saved-queries/:id">) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "query", "delete"))) {
    throw new ForbiddenException("Only owners and editors can delete queries");
  }

  const removed = await deleteSavedQuery(organization, c.req.param("id"));

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "saved_query.deleted",
    targetKind: "saved_query",
    targetId: removed.id,
    targetLabel: removed.name,
  });

  return c.json({ id: removed.id });
}

export async function listQueryVersionsHandler(c: Context<IAuthVars, "/api/v1/organization/:organizationId/saved-queries/:id/versions">) {
  const organization = activeOrganization(c);

  const body = await listQueryVersions(organization, c.req.param("id"));
  return c.json(body);
}

export async function restoreSavedQueryHandler(c: Context<IAuthVars, "/api/v1/organization/:organizationId/saved-queries/:id/restore">) {
  const organization = activeOrganization(c);

  if (!(await can(organization.db, organization.organizationId, c.req.raw.headers, "query", "update"))) {
    throw new ForbiddenException("Only owners and editors can restore queries");
  }

  const body = readBody(await c.req.json(), "A version to restore is required");
  const versionId = readString(body, "versionId", "Choose a version", 200);

  const response = await restoreSavedQuery(
    organization,
    { savedQueryId: c.req.param("id"), versionId },
  );

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "saved_query.restored",
    targetKind: "saved_query",
    targetId: response.savedQuery.id,
    targetLabel: response.savedQuery.name,
  });

  return c.json(response);
}
