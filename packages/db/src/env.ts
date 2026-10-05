import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function findRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("Repo root not found (pnpm-workspace.yaml missing)");
    }
    dir = parent;
  }
  return dir;
}

export const ROOT = findRepoRoot();

const envFile = join(ROOT, ".env");
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile);
  } catch {
  }
}

export const config = {
  dbUrl: process.env.DATABASE_URL ?? "file:./dev.db",
} as const;