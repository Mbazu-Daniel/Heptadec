import { serve } from "@hono/node-server";
import { buildApp } from "./app";
import { config } from "./common/config/env";
import { startScheduler } from "./modules/scheduler";

const app = buildApp();

startScheduler(config.schedulerTickMs);

serve({ fetch: app.fetch, port: config.apiPort }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});
