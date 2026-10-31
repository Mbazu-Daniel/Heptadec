import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "test/billing.test.ts",
      "test/billing-gate.test.ts",
      "test/billing-charge.test.ts",
      "test/billing-reminder.test.ts",
    ],
    globalSetup: ["test/global-setup.ts"],
    setupFiles: ["test/setup-billing.ts"],
    fileParallelism: false,
  },
});
