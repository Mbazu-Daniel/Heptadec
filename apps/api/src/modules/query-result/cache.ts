import {
  and,
  desc,
  eq,
  lt,
} from "drizzle-orm";
import {
  dataSource,
  queryResult,
  savedQuery,
  type HeptadecDatabase,
} from "@heptadec/db";
import {
  BadRequestException,
  NotFoundException,
} from "../../common/exceptions";
import {
  oneRow,
  type IOrganizationScope,
} from "../../common/session/current-organization";
import {
  storedFromRow,
} from "../data-source/connection";
import {
  canBeSaved,
  engineOf,
} from "../data-source/engines";
import {
  runSqlQuery,
} from "../query/sql";
import type { IQueryResponse } from "../query/contracts";
import type { ICachedResult } from "./contracts";

export const DEFAULT_TTL_SECONDS = 60 * 60;

export async function materializeResult(
  queryId: string,
  organization: IOrganizationScope,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<IQueryResponse> {
  const query = await oneRow(organization.db, savedQuery, queryId, organization);
  if (query === undefined) {
    throw new NotFoundException("That saved query does not exist");
  }

  const source = await oneRow(organization.db, dataSource, query.dataSourceId, organization);
  if (source === undefined) {
    throw new NotFoundException("That data source does not exist");
  }
  const engine = engineOf(source);
  if (!canBeSaved(source)) {
    throw new BadRequestException(
      `${engine.name} sources cannot answer saved queries yet`,
    );
  }

  const grid = await runSqlQuery(await storedFromRow(source), query.sql);

  await cacheResult(organization.db, query.organizationId, query.id, grid, ttlSeconds);

  return grid;
}

export async function cacheResult(
  db: HeptadecDatabase,
  organizationId: string,
  savedQueryId: string,
  grid: IQueryResponse,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  const ranAt = new Date();
  await db.insert(queryResult).values({
    organizationId,
    savedQueryId,
    ranAt,
    ttlSeconds,
    payload: JSON.stringify(grid),
  });

  await db
    .delete(queryResult)
    .where(
      and(eq(queryResult.savedQueryId, savedQueryId), lt(queryResult.ranAt, ranAt)),
    );
}

export async function cachedResult(
  queryId: string,
  organization: IOrganizationScope,
): Promise<ICachedResult | null> {
  const rows = await organization.db
    .select()
    .from(queryResult)
    .where(
      and(
        eq(queryResult.savedQueryId, queryId),
        organization.where(queryResult.organizationId),
      ),
    )
    .orderBy(desc(queryResult.ranAt))
    .limit(1);

  const row = rows[0];
  if (row === undefined) {
    return null;
  }

  return {
    id: row.id,
    savedQueryId: row.savedQueryId,
    ranAt: row.ranAt.toISOString(),
    ttlSeconds: row.ttlSeconds,
    stale: row.ranAt.getTime() + row.ttlSeconds * 1000 <= Date.now(),
    grid: JSON.parse(row.payload) as IQueryResponse,
  };
}
