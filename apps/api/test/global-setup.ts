import { join } from "node:path";
import { repoRoot } from "@heptadec/db/node";
import "./setup";

export default async function (): Promise<void> {
  const { migrate } = await import("drizzle-orm/libsql/migrator");
  const { localDatabase } = await import("@heptadec/db");
  await migrate(localDatabase(), {
    migrationsFolder: join(repoRoot(), "packages/db/drizzle"),
  });
}
