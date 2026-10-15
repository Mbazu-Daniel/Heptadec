import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Node-only: Workers has no filesystem, so this stays out of the package
// barrel and is reached only through the "./node" subpath.
export function repoRoot(): string {
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
