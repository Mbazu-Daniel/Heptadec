import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schemas/index";
import { config, ROOT } from "./env";

export function resolveDbUrl(): string {
  if (!config.dbUrl.startsWith("file:")) {
    return config.dbUrl;
  }
  const path = config.dbUrl.slice("file:".length);
  return "file:" + (path.startsWith("/") ? path : join(ROOT, path));
}

const client = createClient({ url: resolveDbUrl() });

for (const pragma of ["PRAGMA journal_mode = WAL", "PRAGMA busy_timeout = 5000"]) {
  void client.execute(pragma).catch((caught: unknown) => {
    console.error(`[db] ${pragma} failed:`, caught);
  });
}

export const db: LibSQLDatabase<typeof schema> = drizzle(client, { schema });
