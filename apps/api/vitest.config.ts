import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    exclude: [...configDefaults.exclude, "test/billing*.test.ts"],
    setupFiles: ["test/setup.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});

