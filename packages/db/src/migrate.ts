import { migrate } from "drizzle-orm/libsql/migrator";
import { localDatabase, resolveDbUrl } from "./client";

const db = localDatabase();

const migrationsFolder = new URL("../drizzle/", import.meta.url).pathname;

console.log(`[db] migrating ${resolveDbUrl()}`);
await migrate(db, { migrationsFolder });
console.log("[db] migrations applied");
