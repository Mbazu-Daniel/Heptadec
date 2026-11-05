import { d1Database } from "@heptadec/db";
import { buildApp } from "./app";
import type { IWorkerEnv } from "./common/config/deployment";
import { runSchedulerTick } from "./modules/scheduler";

const app = buildApp({ compressResponses: false });

const WORKER_PREFIXES = ["/api/", "/health", "/mcp"];

function isWorkerPath(pathname: string): boolean {
  return WORKER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

export default {
  fetch: async (request: Request, env: IWorkerEnv): Promise<Response> => {
    const { pathname } = new URL(request.url);
    const { ASSETS, DB, IMAGES, ...vars } = env;
    if (!isWorkerPath(pathname)) {
      return ASSETS.fetch(request);
    }
    return app.fetch(request, { db: d1Database(DB), images: IMAGES, ...vars });
  },
  scheduled: async (_event: ScheduledController, env: IWorkerEnv): Promise<void> => {
    await runSchedulerTick(d1Database(env.DB), new Date());
  },
} satisfies ExportedHandler<IWorkerEnv>;
