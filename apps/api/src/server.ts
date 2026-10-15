import { localDatabase } from "@heptadec/db";
import { loadDotEnv } from "./dotenv";

loadDotEnv();

const { serve } = await import("@hono/node-server");
const { buildApp } = await import("./app");
const { config } = await import("./common/config/env");
const { startScheduler } = await import("./modules/scheduler");

const app = buildApp({ compressResponses: true });

const db = localDatabase();

startScheduler(db, config.schedulerTickMs);

serve({ fetch: (request: Request) => app.fetch(request, { db }), port: config.apiPort }, (info) => {
  console.log(`[api] listening on http://localhost:${info.port}`);
});
