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

export interface IDeploymentBindings extends IDeploymentVars {
  db: HeptadecDatabase;
  images?: R2Bucket;
}

export interface IWorkerEnv extends IDeploymentVars {
  DB: D1Database;
  ASSETS: Fetcher;
  IMAGES?: R2Bucket;
}
