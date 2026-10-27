import { eq } from "drizzle-orm";
import {
  queryVersion,
  savedQuery,
  type HeptadecDatabase,
} from "@heptadec/db";
import { oneRow } from "../../common/session/current-organization";
import type { IOrganizationScope } from "../../common/session/current-organization";
import { NotFoundException } from "../../common/exceptions";
import type { ISavedQueryChange } from "./contracts";

/**
 * Saves a query, and keeps the version before it.
 *
 * A Query Version is a snapshot of the text a saved query had before an edit,
 * so an edit can be undone. Both the saved query route and the dashboard's
 * chart approval edit queries, and the rule that a version is taken belongs
 * here so the two cannot drift apart.
 */
export async function editSavedQuery(
  organization: IOrganizationScope,
  savedQueryId: string,
  change: ISavedQueryChange,
): Promise<typeof savedQuery.$inferSelect> {
  const existing = await oneRow(
    organization.db,
    savedQuery,
    savedQueryId,
    organization,
  );
  if (existing === undefined) {
    throw new NotFoundException("That saved query does not exist");
  }

  const name = change.name ?? existing.name;
  const sql = change.sql ?? existing.sql;
  if (name === existing.name && sql === existing.sql) {
    return existing;
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
    .set({ name, sql, updatedAt: now })
    .where(eq(savedQuery.id, existing.id))
    .returning();

  const row = updated[0];
  if (row === undefined) {
    throw new NotFoundException("That saved query does not exist");
  }
  return row;
}

/**
 * Saves a query for the first time. A query that has never been edited has no
 * version before it, so there is nothing to snapshot.
 */
export async function createSavedQuery(
  organization: IOrganizationScope,
  input: { dataSourceId: string; name: string; sql: string },
): Promise<typeof savedQuery.$inferSelect> {
  const now = new Date();
  const inserted = await organization.db
    .insert(savedQuery)
    .values({
      organizationId: organization.organizationId,
      dataSourceId: input.dataSourceId,
      name: input.name,
      sql: input.sql,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const row = inserted[0];
  if (row === undefined) {
    throw new NotFoundException("That saved query could not be saved");
  }
  return row;
}
