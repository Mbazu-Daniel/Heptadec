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

// The caller's own membership of the scoped organization. `requireSession` reads
// it once, off the same query that proves the membership exists, and carries it
// so no handler has to ask the member table a second time.
export interface ICaller {
  readonly id: string;
  readonly role: string;
  readonly displayName: string | null;
  readonly image: string | null;
}

// A request's scope always carries the membership that proved it. A scope built
// from an id alone — the scheduler's — is an IOrganizationScope and nothing more.
export interface IRequestScope extends IOrganizationScope {
  readonly caller: ICaller;
}

// The one place a scope is composed from its two halves. A caller that holds an
// id but no request — the scheduler tick, an MCP token — gets the clause here,
// so the pair is never assembled by hand.
export function organizationScope(
  db: HeptadecDatabase,
  organizationId: string,
): IOrganizationScope {
  return { organizationId, db, where: (column) => eq(column, organizationId) };
}

export function activeOrganization(c: Context<IAuthVars>): IRequestScope {
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
