import { and, eq, isNull, lte, or } from "drizzle-orm";
import {
  dataSource,
  dataSourceStructure,
  type DataSourceRow,
  type DataSourceStructureRow,
  type HeptadecDatabase,
} from "@heptadec/db";
import { engineOf } from "../data-source/engines";
import { storedFromRow } from "../data-source/connection";
import { listObjects } from "../data-source/preview";
import type { IStructureSummary } from "../data-source/contracts";
import { structureFailure } from "../../common/driver-error";
import { introspectSchema, readsStructure } from "./introspect";
import type {
  ISchemaResponse,
  IStoredStructure,
  IStructureResponse,
} from "./contracts";

/** How long a stored structure answers a read before the app goes and re-reads it. */
const STRUCTURE_TTL_MS = 6 * 60 * 60_000;

const LEASE_MS = 5 * 60_000;

const MAX_SOURCES_PER_TICK = 5;

/** A source whose database refuses five reads in a row is left as failed rather
 * than retried forever; reading it again is the user's to ask for. */
const MAX_ATTEMPTS = 5;

const RETRY_MS = 5 * 60_000;

/**
 * The largest payload the app will store. One row is what a D1 statement writes,
 * so a structure over this is refused by name rather than written and silently
 * truncated, or lost in a driver error nobody can read back.
 */
const MAX_STRUCTURE_BYTES = 1_000_000;

/**
 * The structure of one source, from the store rather than from the source.
 *
 * Reading a live database is the slow part of every screen that shows a structure
 * — and of asking a question about one — so the app does it in the background and
 * keeps what it finds. A read that meets nothing stored, or nothing fresh, queues
 * a sync and answers from what the last one left behind, so no caller waits on the
 * user's database. An engine with no structure to keep answers live, as it always
 * did.
 */
export async function readStructure(
  db: HeptadecDatabase,
  source: DataSourceRow,
  now: Date,
  waitUntil: (task: Promise<unknown>) => void,
): Promise<IStructureResponse> {
  if (!readsStructure(engineOf(source))) {
    return {
      sourceId: source.id,
      stored: false,
      state: "ready",
      syncing: false,
      stale: false,
      syncedAt: null,
      error: null,
      objects: await listObjects(await storedFromRow(source)),
      database: "",
      schemaName: "",
      tables: [],
      relationships: [],
    };
  }

  const row = await storedRow(db, source.id);
  if (row === undefined) {
    await queueStructure(db, source, now, waitUntil);
    return describe(source.id, undefined, true, now);
  }

  if (isDueForSync(row, now)) {
    await queueStructure(db, source, now, waitUntil);
    return describe(source.id, { ...row, state: "pending" }, true, now);
  }

  return describe(source.id, row, isSyncing(row, now), now);
}

/**
 * The catalogue a question about one source is answered with.
 *
 * What a sync stored is handed over as it was read, so asking never waits on the
 * user's database. The one thing it must never be shown is an empty catalogue:
 * that is how a model invents table names, and it is what a source saved a moment
 * ago looks like before its first sync lands. So the first question reads the
 * source live, exactly as asking always did, and leaves a stored structure behind
 * it for every question after.
 */
export async function schemaForAsk(
  db: HeptadecDatabase,
  source: DataSourceRow,
  now: Date,
  waitUntil: (task: Promise<unknown>) => void,
): Promise<ISchemaResponse> {
  const row = await storedRow(db, source.id);
  const payload = row === undefined ? null : row.payload;
  if (row === undefined || payload === null) {
    await queueStructure(db, source, now, waitUntil);
    return introspectSchema(await storedFromRow(source));
  }

  if (isDueForSync(row, now)) {
    await queueStructure(db, source, now, waitUntil);
  }

  return (JSON.parse(payload) as IStoredStructure).schema;
}

/**
 * Say that this source's structure needs reading, keeping whatever the last sync
 * stored, and go and read it now rather than waiting for the next scheduler tick.
 * The queue position and the result are one row, so a re-queue is a state change
 * rather than a deletion: the source still has the structure the app saw.
 *
 * An engine that keeps no structure has nothing to queue, which is said once here
 * rather than by every caller that saves a source.
 */
export async function queueStructure(
  db: HeptadecDatabase,
  source: DataSourceRow,
  now: Date,
  waitUntil: (task: Promise<unknown>) => void,
): Promise<void> {
  if (!readsStructure(engineOf(source))) {
    return;
  }

  await db
    .insert(dataSourceStructure)
    .values({
      organizationId: source.organizationId,
      dataSourceId: source.id,
      state: "pending",
      attempts: 0,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: dataSourceStructure.dataSourceId,
      set: {
        state: "pending",
        error: null,
        attempts: 0,
        nextAttemptAt: now,
        leaseUntil: null,
        updatedAt: now,
      },
    });

  waitUntil(sweepStructure(db, now));
}

/**
 * Read the structures that are waiting, and store what was found.
 *
 * This is the whole background: the scheduler's tick calls it, and a request that
 * has just queued a sync hands it the same call, so the first read of a new source
 * lands in seconds rather than on the next tick. The claim is what keeps the two
 * from reading the same source twice.
 */
export async function sweepStructure(
  db: HeptadecDatabase,
  now: Date,
): Promise<void> {
  const waiting = await db
    .select()
    .from(dataSourceStructure)
    .where(
      and(
        eq(dataSourceStructure.state, "pending"),
        lte(dataSourceStructure.nextAttemptAt, now),
        or(
          isNull(dataSourceStructure.leaseUntil),
          lte(dataSourceStructure.leaseUntil, now),
        ),
      ),
    )
    .orderBy(dataSourceStructure.nextAttemptAt)
    .limit(MAX_SOURCES_PER_TICK);

  for (const row of waiting) {
    if (!(await claim(db, row, now))) {
      continue;
    }

    const sources = await db
      .select()
      .from(dataSource)
      .where(eq(dataSource.id, row.dataSourceId))
      .limit(1);

    const source = sources[0];
    if (source === undefined) {
      // Removing a source is supposed to remove its structure; a row left behind
      // by an older release has nothing to read.
      await db
        .delete(dataSourceStructure)
        .where(eq(dataSourceStructure.id, row.id));
      continue;
    }

    await syncOne(db, source, row, now);
  }
}

/**
 * What the app has stored about every source in one organization, by source id.
 * The source list carries it so a card can say "syncing" without the list opening
 * one of the user's databases.
 */
export async function structuresOf(
  db: HeptadecDatabase,
  organizationId: string,
  now: Date,
): Promise<Map<string, IStructureSummary>> {
  const rows = await db
    .select()
    .from(dataSourceStructure)
    .where(eq(dataSourceStructure.organizationId, organizationId));

  return new Map(
    rows.map((row) => [
      row.dataSourceId,
      {
        state: row.state,
        syncing: isSyncing(row, now),
        stale: isStale(row, now),
        syncedAt: row.syncedAt?.toISOString() ?? null,
      },
    ]),
  );
}

async function syncOne(
  db: HeptadecDatabase,
  source: DataSourceRow,
  row: DataSourceStructureRow,
  now: Date,
): Promise<void> {
  let found: IStoredStructure;
  try {
    const connection = await storedFromRow(source);
    found = {
      objects: await listObjects(connection),
      schema: await introspectSchema(connection),
    };
  } catch (caught) {
    await retry(db, row, now, structureFailure(caught));
    return;
  }

  const payload = JSON.stringify(found);
  if (payload.length > MAX_STRUCTURE_BYTES) {
    await record(db, row, now, {
      state: "failed",
      attempts: MAX_ATTEMPTS,
      error: `This source's structure is larger than the app can store (${found.objects.length} objects read).`,
      nextAttemptAt: now,
    });
    return;
  }

  await record(db, row, now, {
    state: "ready",
    attempts: 0,
    error: null,
    syncedAt: now,
    nextAttemptAt: now,
    payload,
  });
}

async function retry(
  db: HeptadecDatabase,
  row: DataSourceStructureRow,
  now: Date,
  error: string,
): Promise<void> {
  const attempts = row.attempts + 1;
  await record(db, row, now, {
    state: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
    attempts,
    error,
    nextAttemptAt: new Date(
      now.getTime() + Math.min(2 ** attempts, 6) * RETRY_MS,
    ),
  });
}

type IOutcome = Pick<
  DataSourceStructureRow,
  "state" | "attempts" | "error" | "nextAttemptAt"
> &
  Partial<Pick<DataSourceStructureRow, "payload" | "syncedAt">>;

async function record(
  db: HeptadecDatabase,
  row: DataSourceStructureRow,
  now: Date,
  outcome: IOutcome,
): Promise<void> {
  await db
    .update(dataSourceStructure)
    .set({ ...outcome, leaseUntil: null, updatedAt: now })
    .where(eq(dataSourceStructure.id, row.id));
}

async function claim(
  db: HeptadecDatabase,
  row: DataSourceStructureRow,
  now: Date,
): Promise<boolean> {
  const claimed = await db
    .update(dataSourceStructure)
    .set({ leaseUntil: new Date(now.getTime() + LEASE_MS), updatedAt: now })
    .where(
      and(
        eq(dataSourceStructure.id, row.id),
        or(
          isNull(dataSourceStructure.leaseUntil),
          lte(dataSourceStructure.leaseUntil, now),
        ),
      ),
    )
    .returning({ id: dataSourceStructure.id });
  return claimed.length > 0;
}

async function storedRow(
  db: HeptadecDatabase,
  dataSourceId: string,
): Promise<DataSourceStructureRow | undefined> {
  const rows = await db
    .select()
    .from(dataSourceStructure)
    .where(eq(dataSourceStructure.dataSourceId, dataSourceId))
    .limit(1);
  return rows[0];
}

/** A sync is running now, or is the next thing that will. */
function isSyncing(row: DataSourceStructureRow, now: Date): boolean {
  return (
    row.state === "pending" ||
    (row.leaseUntil !== null && row.leaseUntil.getTime() > now.getTime())
  );
}

function isStale(row: DataSourceStructureRow, now: Date): boolean {
  return (
    row.syncedAt !== null &&
    row.syncedAt.getTime() + STRUCTURE_TTL_MS <= now.getTime()
  );
}

/** A stored structure the app would rather re-read than keep answering with. */
function isDueForSync(row: DataSourceStructureRow, now: Date): boolean {
  return row.state === "ready" && isStale(row, now) && !isSyncing(row, now);
}

/**
 * What the app can say about a source's structure from the row it has — which
 * includes the row that is not there yet, answered as the pending sync it is.
 */
function describe(
  sourceId: string,
  row: DataSourceStructureRow | undefined,
  syncing: boolean,
  now: Date,
): IStructureResponse {
  const payload = row?.payload ?? null;
  const found = payload === null ? null : (JSON.parse(payload) as IStoredStructure);
  const schema = found?.schema;
  return {
    sourceId,
    stored: true,
    state: row?.state ?? "pending",
    syncing,
    stale: row === undefined ? false : isStale(row, now),
    syncedAt: row?.syncedAt?.toISOString() ?? null,
    error: row?.error ?? null,
    objects: found?.objects ?? [],
    database: schema?.database ?? "",
    schemaName: schema?.schemaName ?? "",
    tables: schema?.tables ?? [],
    relationships: schema?.relationships ?? [],
  };
}
