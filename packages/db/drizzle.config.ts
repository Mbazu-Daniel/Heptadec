import { defineConfig } from "drizzle-kit";
import { resolveDbUrl } from "./src/client";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schemas/index.ts",
  out: "./drizzle",
  dbCredentials: {
    url: resolveDbUrl(),
  },
});