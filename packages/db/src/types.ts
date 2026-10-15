import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import type * as schema from "./schemas/index";

export type HeptadecDatabase = BaseSQLiteDatabase<"async", unknown, typeof schema>;
