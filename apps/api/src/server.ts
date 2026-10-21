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

const { r2 } = config;

serve(
  {
    fetch: (request: Request) =>
      app.fetch(request, {
        db,
        R2_BUCKET_NAME: r2.bucketName,
        CLOUDFLARE_ACCOUNT_ID: r2.accountId,
        R2_PUBLIC_ID: r2.publicId,
        R2_CUSTOM_DOMAIN: r2.customDomain,
        R2_ACCESS_KEY_ID: r2.accessKeyId,
        R2_SECRET_ACCESS_KEY: r2.secretAccessKey,
      }),
    port: config.apiPort,
  },
  (info) => {
    console.log(`[api] listening on http://localhost:${info.port}`);
    console.log(
      r2.accessKeyId === ""
        ? "[api] image storage not configured (no R2_ACCESS_KEY_ID)"
        : `[api] images in ${r2.bucketName}, read from ${
            r2.customDomain !== ""
              ? r2.customDomain
              : r2.publicId === ""
                ? "the API (no public base configured)"
                : `https://pub-${r2.publicId}.r2.dev`
          }`,
    );
  },
);
