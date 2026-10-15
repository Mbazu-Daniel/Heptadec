import { and, eq, type Column, type SQL } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Context } from "hono";
import type { HeptadecDatabase } from "@heptadec/db";
import type { AuthSession } from "../config/better-auth";
import { ForbiddenException } from "../exceptions";
import type { IAuthVars } from "../middleware/require-session";

export interface IOrganizationScope {
  readonly organizationId: string;
  readonly db: HeptadecDatabase;
  where: (organizationIdColumn: Column) => SQL;
}

export function activeOrganization(c: Context<IAuthVars>): IOrganizationScope {
  const organization = c.get("organization");
  if (organization !== undefined && organization !== null) {
    return organization;
  }
  throw new ForbiddenException("You are not a member of that organization");
}

export function currentOrganizationId(session: AuthSession | null): string | null {
  return session?.session.activeOrganizationId ?? null;
}

type IScopedTable = SQLiteTable & {
  id: SQLiteColumn;
  organizationId: SQLiteColumn;
};

export async function oneRow<T extends IScopedTable>(
  db: HeptadecDatabase,
  table: T,
  id: string,
  organization: IOrganizationScope,
): Promise<T["$inferSelect"] | undefined> {
  const rows = await db
    .select()
    .from(table)
    .where(and(eq(table.id, id), organization.where(table.organizationId)))
    .limit(1);
  return rows[0];
}
