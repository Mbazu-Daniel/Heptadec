import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import type * as schema from "./schemas/index";

// Both drivers (libSQL for dev/self-host, D1 for the Worker) implement `batch`,
// but it is not on BaseSQLiteDatabase. Declaring it here lets a request coalesce
// its independent queries into one round-trip — which on D1 is the difference
// between five edge-to-database hops and one.
export type HeptadecDatabase = BaseSQLiteDatabase<"async", unknown, typeof schema> & {
  batch<U extends BatchItem<"sqlite">, T extends Readonly<[U, ...U[]]>>(
    queries: T,
  ): Promise<BatchResponse<T>>;
};
