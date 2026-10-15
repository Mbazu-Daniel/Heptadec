import { join } from "node:path";
import { migrate } from "drizzle-orm/libsql/migrator";
import { localDatabase, resolveDbUrl } from "./client";
import { ROOT } from "./env";

const db = localDatabase();

const migrationsFolder = join(ROOT, "packages/db/drizzle");

console.log(`[db] migrating ${resolveDbUrl()}`);
await migrate(db, { migrationsFolder });
console.log("[db] migrations applied");