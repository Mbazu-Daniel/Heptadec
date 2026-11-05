import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type { BatchItem, BatchResponse } from "drizzle-orm/batch";
import type * as schema from "./schemas/index";

export type HeptadecDatabase = BaseSQLiteDatabase<"async", unknown, typeof schema> & {
  batch<U extends BatchItem<"sqlite">, T extends Readonly<[U, ...U[]]>>(
    queries: T,
  ): Promise<BatchResponse<T>>;
};
