import type { IAuthVars } from "../../common/middleware/require-session";

/**
 * Where the browser reads an object back from. Kept under /api so the Worker
 * answers it instead of handing the request to the static assets, and kept for
 * the deployments that have no public bucket.
 */
export const MEDIA_PATH_PREFIX = "/api/images/";

/**
 * The bucket's public base, or null when there is none.
 *
 * A custom domain wins over the managed `r2.dev` one: the managed domain is
 * rate-limited and meant for development, so it is the fallback rather than the
 * answer.
 */
export function publicBaseFrom(env: IAuthVars["Bindings"]): string | null {
  const custom = env.R2CustomDomain?.trim();
  if (custom !== undefined && custom !== "") {
    return /^https?:\/\//.test(custom) ? custom : `https://${custom}`;
  }
  const id = env.R2PublicId?.trim();
  return id === undefined || id === "" ? null : `https://pub-${id}.r2.dev`;
}

/**
 * The URL a browser loads an object from, from the key the database holds.
 *
 * Recomputed on every read rather than stored, so pointing a deployment at a
 * custom domain is a variable change and not a migration over every row.
 * Without a public base the bytes come back through the Worker instead, which
 * costs an invocation per read but needs no public bucket.
 */
export function mediaUrl(key: string | null, publicBase: string | null): string | null {
  if (key === null || key === "") {
    return null;
  }
  return publicBase === null ? `${MEDIA_PATH_PREFIX}${key}` : `${publicBase}/${key}`;
}