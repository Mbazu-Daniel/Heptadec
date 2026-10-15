import { existsSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "@heptadec/db/node";

export function loadDotEnv(): void {
  const envFile = join(repoRoot(), ".env");
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}
