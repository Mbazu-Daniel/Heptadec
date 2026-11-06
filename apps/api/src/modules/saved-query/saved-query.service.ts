import { and, desc, eq } from "drizzle-orm";
import {
  dataSource,
  queryVersion,
  savedQuery,
} from "@heptadec/db";
import {
  createSavedQuery as insertSavedQuery,
  editSavedQuery,
} from "./edit";

import { deleteSavedQueryRows } from "../../common/ownership";
import { oneRow, type IOrganizationScope } from "../../common/session/current-organization";
import {
  NotFoundException,
} from "../../common/exceptions/index";
import type {
  IQueryVersion,
  IQueryVersionListResponse,
  ISavedQuery,
  ISavedQueryListResponse,
  ISavedQueryResponse,
} from "./contracts";
import type {
  ICreateSavedQueryInput,
  IRecordRunInput,
  IRecordRunResult,
  IRemovedSavedQuery,
  IRestoreInput,
  IUpdateSavedQueryInput,
} from "./types";

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

export async function listSavedQueries(
  organization: IOrganizationScope,
): Promise<ISavedQueryListResponse> {
  const rows = await organization.db
    .select()
    .from(savedQuery)
    .where(organization.where(savedQuery.organizationId))
    .orderBy(savedQuery.createdAt);

  const body: ISavedQueryListResponse = {
    savedQueries: rows.map(toISavedQuery),
  };
  return body;
}

export async function listSavedQueriesForSource(
  organization: IOrganizationScope,
  dataSourceId: string,
): Promise<ISavedQueryListResponse> {
  const source = await oneRow(organization.db, dataSource, dataSourceId, organization);
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
  return body;
}

export async function createSavedQueryForSource(
  organization: IOrganizationScope,
  input: ICreateSavedQueryInput,
): Promise<ISavedQueryResponse> {
  const source = await oneRow(organization.db, dataSource, input.dataSourceId, organization);
  if (source === undefined) {
    throw new NotFoundException("That data source does not exist");
  }

  const created = await insertSavedQuery(organization, {
    dataSourceId: source.id,
    name: input.name,
    sql: input.sql,
  });

  const response: ISavedQueryResponse = { savedQuery: toISavedQuery(created) };
  return response;
}

export async function recordSavedQueryRun(
  organization: IOrganizationScope,
  input: IRecordRunInput,
): Promise<IRecordRunResult> {
  const source = await oneRow(organization.db, dataSource, input.dataSourceId, organization);
  if (source === undefined) {
    throw new NotFoundException("That data source does not exist");
  }

  const sql = input.sql;

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
    return { response, created: false };
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
  return { response, created: true };
}

export async function updateSavedQuery(
  organization: IOrganizationScope,
  input: IUpdateSavedQueryInput,
): Promise<ISavedQueryResponse> {
  const row = await editSavedQuery(
    organization,
    input.savedQueryId,
    { name: input.name, sql: input.sql },
  );

  const response: ISavedQueryResponse = { savedQuery: toISavedQuery(row) };
  return response;
}

export async function deleteSavedQuery(
  organization: IOrganizationScope,
  savedQueryId: string,
): Promise<IRemovedSavedQuery> {
  const existing = await oneRow(organization.db, savedQuery, savedQueryId, organization);
  if (existing === undefined) {
    throw new NotFoundException("That saved query does not exist");
  }
  await deleteSavedQueryRows(organization, existing.id);

  return { id: existing.id, name: existing.name };
}

export async function listQueryVersions(
  organization: IOrganizationScope,
  savedQueryId: string,
): Promise<IQueryVersionListResponse> {
  const existing = await oneRow(organization.db, savedQuery, savedQueryId, organization);
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
  return body;
}

export async function restoreSavedQuery(
  organization: IOrganizationScope,
  input: IRestoreInput,
): Promise<ISavedQueryResponse> {
  const existing = await oneRow(organization.db, savedQuery, input.savedQueryId, organization);
  if (existing === undefined) {
    throw new NotFoundException("That saved query does not exist");
  }

  const versionId = input.versionId;

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

  const response: ISavedQueryResponse = { savedQuery: toISavedQuery(row) };
  return response;
}
