import { and, asc, desc, eq, gt, lte, sql } from "drizzle-orm";
import {
  billingPayment,
  member,
  organization,
  schedulerLease,
  type HeptadecDatabase,
} from "@heptadec/db";
import {
  NotFoundException,
  PaymentRequiredException,
} from "../../common/exceptions";
import { billingConfigured } from "./catalog";
import type { BillingCadence } from "./contracts";

export const FREE_TIER_ORG_LIMIT = 1;

export interface IEntitlement {
  entitled: boolean;
}

export interface IAccountPayment {
  paid: boolean;
  paidUntil: Date | null;
  cadence: BillingCadence | null;
}

// The account owner of an organization is the member who holds the owner role
// and joined before every other owner of that organization. Better Auth makes
// the creator the first owner, so this is the single person whose free
// allowance and paid plan cover the organization. A later co-owner is
// deliberately excluded: without it, promoting someone would push their own
// oldest organization out of their free allowance and let them create
// organizations on another account's payment.
function soleOwner(owner: typeof member, userId: string) {
  return and(
    eq(owner.role, "owner"),
    eq(owner.userId, userId),
    sql`not exists (
      select 1 from member earlier
      where earlier.organization_id = ${owner.organizationId}
        and earlier.role = 'owner'
        and (
          earlier.created_at < ${owner.createdAt}
          or (earlier.created_at = ${owner.createdAt} and earlier.id < ${owner.id})
        )
    )`,
  );
}

export async function organizationsOwned(
  db: HeptadecDatabase,
  userId: string,
): Promise<number> {
  const rows = await db
    .select({ id: member.organizationId })
    .from(member)
    .where(soleOwner(member, userId));
  return rows.length;
}

// The account pays whenever an organization the user owns as its sole owner has
// a live period.
export async function accountPayment(
  db: HeptadecDatabase,
  userId: string,
): Promise<IAccountPayment> {
  const rows = await db
    .select({
      periodEndsAt: billingPayment.periodEndsAt,
      cadence: billingPayment.cadence,
    })
    .from(billingPayment)
    .innerJoin(member, eq(member.organizationId, billingPayment.organizationId))
    .where(and(soleOwner(member, userId), gt(billingPayment.periodEndsAt, new Date())))
    .orderBy(desc(billingPayment.periodEndsAt))
    .limit(1);
  const found = rows[0];
  if (found === undefined || found.periodEndsAt === null) {
    return { paid: false, paidUntil: null, cadence: null };
  }
  return { paid: true, paidUntil: found.periodEndsAt, cadence: found.cadence };
}

// A deployment without billing never blocks, and a paid account is unlimited.
// The unpaid path is the one that needs mutual exclusion: two concurrent
// "create another organization" submits can both read an under-limit owned count
// before either insert lands and overshoot the one-free-organization allowance.
// Exactly one wins the per-user slot, and the winner releases it from
// afterCreateOrganization. Better Auth runs organizationLimit before its own
// duplicate-slug check, so a create can claim the slot and then fail without
// reaching the hook; the TTL is the cleanup for that path, kept just wide
// enough to outlast a real create (a few D1 round-trips) so a retry is not
// wrongly told it has hit the organization limit.
const ORG_CREATE_LEASE_MS = 10_000;

function organizationCreateSlot(userId: string): string {
  return `org-create:${userId}`;
}

export async function authorizeOrganizationCreate(
  db: HeptadecDatabase,
  userId: string,
): Promise<boolean> {
  if (!billingConfigured()) {
    return true;
  }
  if ((await accountPayment(db, userId)).paid) {
    return true;
  }
  if (!(await claimOrganizationCreateSlot(db, userId))) {
    return false;
  }
  if ((await organizationsOwned(db, userId)) < FREE_TIER_ORG_LIMIT) {
    return true;
  }
  await releaseOrganizationCreateSlot(db, userId);
  return false;
}

async function claimOrganizationCreateSlot(
  db: HeptadecDatabase,
  userId: string,
): Promise<boolean> {
  const now = new Date();
  const name = organizationCreateSlot(userId);
  const leaseUntil = new Date(now.getTime() + ORG_CREATE_LEASE_MS);
  const renewed = await db
    .update(schedulerLease)
    .set({ leaseUntil })
    .where(
      and(eq(schedulerLease.name, name), lte(schedulerLease.leaseUntil, now)),
    )
    .returning({ name: schedulerLease.name });
  if (renewed.length > 0) {
    return true;
  }
  const created = await db
    .insert(schedulerLease)
    .values({ name, leaseUntil })
    .onConflictDoNothing()
    .returning({ name: schedulerLease.name });
  return created.length > 0;
}

export async function releaseOrganizationCreateSlot(
  db: HeptadecDatabase,
  userId: string,
): Promise<void> {
  await db
    .delete(schedulerLease)
    .where(eq(schedulerLease.name, organizationCreateSlot(userId)));
}

// Entitlement is a question about the organization's owner, answered in at most
// two round-trips so the gate that runs on every product request never fans out
// to sequential per-query hops — each one a network call when the database is D1.
export async function entitlementFor(
  db: HeptadecDatabase,
  organizationId: string,
): Promise<IEntitlement> {
  const now = new Date();
  const [existing, livePeriod, owners] = await db.batch([
    db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1),
    db
      .select({ id: billingPayment.id })
      .from(billingPayment)
      .where(
        and(
          eq(billingPayment.organizationId, organizationId),
          gt(billingPayment.periodEndsAt, now),
        ),
      )
      .limit(1),
    db
      .select({ userId: member.userId })
      .from(member)
      .where(
        and(eq(member.organizationId, organizationId), eq(member.role, "owner")),
      )
      .orderBy(asc(member.createdAt))
      .limit(1),
  ]);

  if (existing[0] === undefined) {
    throw new NotFoundException("That organization no longer exists");
  }
  if (!billingConfigured() || livePeriod[0] !== undefined) {
    return { entitled: true };
  }

  const owner = owners[0]?.userId;
  if (owner === undefined) {
    return { entitled: false };
  }

  const [allowance, account] = await db.batch([
    db
      .select({ organizationId: member.organizationId })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(soleOwner(member, owner))
      .orderBy(asc(organization.createdAt))
      .limit(FREE_TIER_ORG_LIMIT),
    db
      .select({ id: billingPayment.id })
      .from(billingPayment)
      .innerJoin(member, eq(member.organizationId, billingPayment.organizationId))
      .where(and(soleOwner(member, owner), gt(billingPayment.periodEndsAt, now)))
      .limit(1),
  ]);

  const withinAllowance = allowance.some(
    (row) => row.organizationId === organizationId,
  );
  return { entitled: withinAllowance || account[0] !== undefined };
}

export async function requireEntitlement(
  db: HeptadecDatabase,
  organizationId: string,
): Promise<void> {
  const { entitled } = await entitlementFor(db, organizationId);
  if (!entitled) {
    throw new PaymentRequiredException(
      "This organization is beyond the free plan and has no paid period",
    );
  }
}
