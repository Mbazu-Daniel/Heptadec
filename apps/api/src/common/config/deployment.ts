import type { HeptadecDatabase } from "@heptadec/db";

export interface IDeploymentVars {
  R2_BUCKET_NAME?: string;
  R2_PUBLIC_ID?: string;
  R2_CUSTOM_DOMAIN?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_SESSION_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
}

/**
 * What a request's environment holds: the bound database and images bucket, the
 * variables above, and the deployment's way of running work after the response.
 *
 * The runtime binds DB and IMAGES as cloud objects; before a request sees them
 * the D1 binding is converted to the app's database, which the Worker entry
 * point does once, on the way in.
 *
 * `waitUntil` is how a request hands work to the runtime instead of making a
 * user wait for it — reading a source's structure, for instance. A Worker defers
 * the response's teardown until the task settles; the Node server has no such
 * hook, so it runs the task on its own clock. Both are backstopped by the
 * scheduler's tick, which reads whatever the hand-off did not get to.
 */
export interface IDeploymentBindings extends IDeploymentVars {
  db: HeptadecDatabase;
  images?: R2Bucket;
  waitUntil: (task: Promise<unknown>) => void;
}

export interface IWorkerEnv extends IDeploymentVars {
  DB: D1Database;
  ASSETS: Fetcher;
  IMAGES?: R2Bucket;
}
