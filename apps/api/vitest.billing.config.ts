import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/billing.test.ts", "test/billing-gate.test.ts"],
    setupFiles: ["test/setup-billing.ts"],
    fileParallelism: false,
  },
});
