import type { HeptadecDatabase } from "@heptadec/db";

/**
 * What a deployment passes to the app by name: the image bucket's coordinates
 * and credentials, and the account the bucket lives in. Everything here is
 * optional — a deployment without image storage leaves the fields unset, and
 * the routes that need them report that instead of failing.
 */
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
 * What a request's environment holds: the bound database and images bucket,
 * and the variables above.
 *
 * The runtime binds DB and IMAGES as cloud objects; before a request sees them
 * the D1 binding is converted to the app's database, which the Worker entry
 * point does once, on the way in.
 */
export interface IDeploymentBindings extends IDeploymentVars {
  db: HeptadecDatabase;
  images?: R2Bucket;
}

/**
 * The raw environment the Worker runtime hands the entry point: its own
 * bindings by name, the static assets fetcher, and the variables above.
 */
export interface IWorkerEnv extends IDeploymentVars {
  DB: D1Database;
  ASSETS: Fetcher;
  IMAGES?: R2Bucket;
}
