import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { schema } from "@heptadec/db";
import { createSavedQuery, editSavedQuery } from "./edit";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { readBody, readOptionalString, readString } from "../../common/http/body";
import { activeOrganization, oneRow } from "../../common/session/current-organization";
import {
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions";
import { can } from "../rbac/authorize";
import { recordAudit, auditActor } from "../audit";
import { deleteSavedQueryRows } from "../../common/ownership";
import type {
  ICreateSavedQueryRequest,
  IQueryVersion,
  IQueryVersionListResponse,
  ISavedQuery,
  ISavedQueryListResponse,
  ISavedQueryResponse,
  IUpdateSavedQueryRequest,
} from "./contracts";

const { dataSource, queryVersion, savedQuery } = schema;

const MAX_NAME = 120;

const MAX_SQL = 20_000;

const NAME_FROM_SQL = 72;

function nameFor(sql: string): string {
  const line = sql.replace(/\s+/g, " ").trim();
  return line.length <= NAME_FROM_SQL
    ? line
    : `${line.slice(0, NAME_FROM_SQL - 1)}…`;
}

function toISavedQuery(row: typeof savedQuery.$inferSelect): ISavedQuery {
  return {
    id: row.id,
    dataSourceId: row.dataSourceId,
    name: row.name,
    sql: row.sql,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toIQueryVersion(row: typeof queryVersion.$inferSelect): IQueryVersion {
  return {
    id: row.id,
    name: row.name,
    sql: row.sql,
    createdAt: row.createdAt.toISOString(),
  };
}

export function savedQueryRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();
  routes.get("/api/saved-queries", requireSession, async (c) => {
    const organization = activeOrganization(c);

    const rows = await organization.db
      .select()
      .from(savedQuery)
      .where(organization.where(savedQuery.organizationId))
      .orderBy(savedQuery.createdAt);

    const body: ISavedQueryListResponse = {
      savedQueries: rows.map(toISavedQuery),
    };
    return c.json(body);
  });
  routes.get("/api/data-sources/:id/saved-queries", requireSession, async (c) => {
    const organization = activeOrganization(c);

    const source = await oneRow(organization.db, dataSource, c.req.param("id"), organization);
    if (source === undefined) {
      throw new NotFoundException("That data source does not exist");
    }

    const rows = await organization.db
      .select()
      .from(savedQuery)
      .where(
        and(
          eq(savedQuery.dataSourceId, source.id),
          organization.where(savedQuery.organizationId),
        ),
      )
      .orderBy(savedQuery.createdAt);

    const body: ISavedQueryListResponse = {
      savedQueries: rows.map(toISavedQuery),
    };
    return c.json(body);
  });

  routes.post("/api/data-sources/:id/saved-queries", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "query", "create"))) {
      throw new ForbiddenException("Only owners and editors can save queries");
    }

    const source = await oneRow(organization.db, dataSource, c.req.param("id"), organization);
    if (source === undefined) {
      throw new NotFoundException("That data source does not exist");
    }

    const body = readBody(await c.req.json(), "A saved query is required");
    const request: ICreateSavedQueryRequest = {
      name: readString(body, "name", "Give the query a name", MAX_NAME),
      sql: readString(body, "sql", "Write the statement to save", MAX_SQL),
    };

    const created = await createSavedQuery(organization, {
      dataSourceId: source.id,
      name: request.name,
      sql: request.sql,
    });
    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "saved_query.created",
      targetKind: "saved_query",
      targetId: created.id,
      targetLabel: created.name,
    });
    const response: ISavedQueryResponse = { savedQuery: toISavedQuery(created) };
    return c.json(response, 201);
  });

  routes.post("/api/data-sources/:id/saved-queries/runs", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "query", "create"))) {
      throw new ForbiddenException("Only owners and editors can save queries");
    }

    const source = await oneRow(organization.db, dataSource, c.req.param("id"), organization);
    if (source === undefined) {
      throw new NotFoundException("That data source does not exist");
    }

    const body = readBody(await c.req.json(), "A statement is required");
    const sql = readString(body, "sql", "Write the statement to record", MAX_SQL);

    const existing = await organization.db
      .select()
      .from(savedQuery)
      .where(
        and(
          eq(savedQuery.dataSourceId, source.id),
          organization.where(savedQuery.organizationId),
          eq(savedQuery.sql, sql),
        ),
      )
      .limit(1);

    const found = existing[0];
    if (found !== undefined) {
      const moved = await organization.db
        .update(savedQuery)
        .set({ updatedAt: new Date() })
        .where(eq(savedQuery.id, found.id))
        .returning();
      const response: ISavedQueryResponse = { savedQuery: toISavedQuery(moved[0]!) };
      return c.json(response);
    }

    const now = new Date();
    const inserted = await organization.db
      .insert(savedQuery)
      .values({
        organizationId: organization.organizationId,
        dataSourceId: source.id,
        name: nameFor(sql),
        sql,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const created = inserted[0];
    if (created === undefined) {
      throw new NotFoundException("That query could not be recorded");
    }
    const response: ISavedQueryResponse = { savedQuery: toISavedQuery(created) };
    return c.json(response, 201);
  });

  routes.patch("/api/saved-queries/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "query", "update"))) {
      throw new ForbiddenException("Only owners and editors can edit queries");
    }

    const existing = await oneRow(organization.db, savedQuery, c.req.param("id"), organization);
    if (existing === undefined) {
      throw new NotFoundException("That saved query does not exist");
    }

    const body = readBody(await c.req.json(), "An update is required");
    const request: IUpdateSavedQueryRequest = {
      name: readOptionalString(body, "name", "Give the query a name", MAX_NAME),
      sql: readOptionalString(body, "sql", "Write the statement to save", MAX_SQL),
    };

    const row = await editSavedQuery(organization, existing.id, request);
    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "saved_query.updated",
      targetKind: "saved_query",
      targetId: row.id,
      targetLabel: row.name,
    });
    const response: ISavedQueryResponse = { savedQuery: toISavedQuery(row) };
    return c.json(response);
  });

  routes.delete("/api/saved-queries/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "query", "delete"))) {
      throw new ForbiddenException("Only owners and editors can delete queries");
    }

    const existing = await oneRow(organization.db, savedQuery, c.req.param("id"), organization);
    if (existing === undefined) {
      throw new NotFoundException("That saved query does not exist");
    }
    await deleteSavedQueryRows(organization, existing.id);
    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "saved_query.deleted",
      targetKind: "saved_query",
      targetId: existing.id,
      targetLabel: existing.name,
    });
    return c.json({ id: existing.id });
  });
  routes.get("/api/saved-queries/:id/versions", requireSession, async (c) => {
    const organization = activeOrganization(c);

    const existing = await oneRow(organization.db, savedQuery, c.req.param("id"), organization);
    if (existing === undefined) {
      throw new NotFoundException("That saved query does not exist");
    }

    const rows = await organization.db
      .select()
      .from(queryVersion)
      .where(
        and(
          eq(queryVersion.savedQueryId, existing.id),
          organization.where(queryVersion.organizationId),
        ),
      )
      .orderBy(desc(queryVersion.createdAt));

    const body: IQueryVersionListResponse = {
      versions: rows.map(toIQueryVersion),
    };
    return c.json(body);
  });
  routes.post("/api/saved-queries/:id/restore", requireSession, async (c) => {
    const organization = activeOrganization(c);

    if (!(await can(organization.db, c.req.raw.headers, "query", "update"))) {
      throw new ForbiddenException("Only owners and editors can restore queries");
    }

    const existing = await oneRow(organization.db, savedQuery, c.req.param("id"), organization);
    if (existing === undefined) {
      throw new NotFoundException("That saved query does not exist");
    }

    const body = readBody(await c.req.json(), "A version to restore is required");
    const versionId = readString(body, "versionId", "Choose a version", 200);

    const versionRows = await organization.db
      .select()
      .from(queryVersion)
      .where(
        and(
          eq(queryVersion.id, versionId),
          eq(queryVersion.savedQueryId, existing.id),
          organization.where(queryVersion.organizationId),
        ),
      )
      .limit(1);
    const version = versionRows[0];
    if (version === undefined) {
      throw new NotFoundException("That version does not exist");
    }

    const now = new Date();
    await organization.db.insert(queryVersion).values({
      organizationId: existing.organizationId,
      savedQueryId: existing.id,
      name: existing.name,
      sql: existing.sql,
      createdAt: now,
    });

    const updated = await organization.db
      .update(savedQuery)
      .set({ name: version.name, sql: version.sql, updatedAt: now })
      .where(eq(savedQuery.id, existing.id))
      .returning();

    const row = updated[0];
    if (row === undefined) {
      throw new NotFoundException("That saved query does not exist");
    }
    const actor = await auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "saved_query.restored",
      targetKind: "saved_query",
      targetId: row.id,
      targetLabel: row.name,
    });
    const response: ISavedQueryResponse = { savedQuery: toISavedQuery(row) };
    return c.json(response);
  });

  return routes;
}
