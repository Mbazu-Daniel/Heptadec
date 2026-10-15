import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { drizzle as drizzleD1 } from "drizzle-orm/d1";
import * as schema from "./schemas/index";
import { config } from "./env";
import type { HeptadecDatabase } from "./types";

export type { HeptadecDatabase };

const PRAGMAS = ["PRAGMA journal_mode = WAL", "PRAGMA busy_timeout = 5000"];

export function resolveDbUrl(): string {
  if (!config.dbUrl.startsWith("file:")) {
    return config.dbUrl;
  }
  const path = config.dbUrl.slice("file:".length);
  if (path.startsWith("/")) {
    return config.dbUrl;
  }
  // Relative file: paths resolve from the repo root, three levels above src/client.ts.
  return "file:" + new URL(path, new URL("../../../", import.meta.url)).pathname;
}

export function localDatabase(): LibSQLDatabase<typeof schema> {
  const client = createClient({ url: resolveDbUrl() });
  for (const pragma of PRAGMAS) {
    void client.execute(pragma).catch((caught: unknown) => {
      console.error(`[db] ${pragma} failed:`, caught);
    });
  }
  return drizzle(client, { schema });
}

export function d1Database(binding: D1Database): HeptadecDatabase {
  return drizzleD1(binding, { schema });
}
