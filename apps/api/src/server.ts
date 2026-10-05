import { serve } from "@hono/node-server";
import { buildApp } from "./app";
import { config } from "./common/config/env";

const app = buildApp();

serve({ fetch: app.fetch, port: config.apiPort }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});