// No filesystem access here: this module is reached by the Workers bundle
// through the package barrel. Node-only helpers live in "./node".
export const config = {
  dbUrl: process.env.DATABASE_URL ?? "file:./dev.db",
} as const;
