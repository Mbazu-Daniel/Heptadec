import { join } from "node:path";
import { repoRoot } from "@heptadec/db/node";
import "./setup";

// The db module reads DATABASE_URL when it is first imported, so it has to be
// imported after ./setup has pointed the suite at its own file rather than dev.db.
export default async function (): Promise<void> {
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const { localDatabase } = await import("@heptadec/db");
  await migrate(localDatabase(), {
    migrationsFolder: join(repoRoot(), "packages/db/drizzle"),
  });
}
