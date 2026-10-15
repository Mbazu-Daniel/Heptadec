import { serve } from "@hono/node-server";
import { localDatabase } from "@heptadec/db";
import { buildApp } from "./app";
import { config } from "./common/config/env";
import { startScheduler } from "./modules/scheduler";

const app = buildApp();

const db = localDatabase();

startScheduler(db, config.schedulerTickMs);

serve(
  { fetch: (request: Request) => app.fetch(request, { db }), port: config.apiPort },
  (info) => {
    console.log(`[api] listening on http://localhost:${info.port}`);
  },
);
