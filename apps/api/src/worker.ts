import { d1Database } from "@heptadec/db";
import { buildApp } from "./app";
import { runDueJobs } from "./modules/scheduler";

const app = buildApp({ compressResponses: false });

// Paths the Worker answers itself. Anything else is a client route and must
// fall through to the static assets, which serve index.html so a deep link or
// a page refresh does not 404.
const WORKER_PREFIXES = ["/api/", "/health", "/mcp"];

function isWorkerPath(pathname: string): boolean {
  return WORKER_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

interface IWorkerEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  IMAGES?: R2Bucket;
}

export default {
  fetch: async (request: Request, env: IWorkerEnv): Promise<Response> => {
    const { pathname } = new URL(request.url);
    if (!isWorkerPath(pathname)) {
      return env.ASSETS.fetch(request);
    }
    return app.fetch(request, {
      db: d1Database(env.DB),
      images: env.IMAGES,
    });
  },
  scheduled: async (_event: ScheduledController, env: IWorkerEnv): Promise<void> => {
    await runDueJobs(d1Database(env.DB), new Date());
  },
} satisfies ExportedHandler<IWorkerEnv>;
