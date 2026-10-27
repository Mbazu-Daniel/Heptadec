import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // The billing suites need the Bachs sandbox env that only
    // test/setup-billing.ts sets; they run under vitest.billing.config.ts.
    exclude: [...configDefaults.exclude, "test/billing*.test.ts"],
    setupFiles: ["test/setup.ts"],
    // The suite runs against real engines and a full app per request, so a
    // test is a round-trip or twelve; five seconds is a loaded machine's
    // normal, not a failure.
    testTimeout: 30_000,
    fileParallelism: false,
  },
});

