/** Which image an upload is for. Decides the key and who may ask for it. */
export type ImageTarget = "avatar" | "logo";

/**
 * Where an organization's member avatars live.
 *
 * Scoped by organization and by membership. An avatar is a property of the
 * membership, not of the person: the same person can be different in two
 * organizations, and one organization's image cannot be pointed at another's.
 * Keyed by member rather than by user for the same reason — the membership is
 * what identifies it.
 */
export function avatarKeyPrefixFor(organizationId: string): string {
  return `avatars/${organizationId}/`;
}

export function logoKeyFor(organizationId: string): string {
  return `logos/${organizationId}`;
}


export interface IImagesConfigResponse {
  /**
   * Whether this deployment can sign an upload, which needs the R2 S3
   * credentials as well as the bucket's settings. Reported so the upload control
   * can say so at the point of use rather than failing afterwards.
   */
  configured: boolean;
  /**
   * The bucket's public base, or null. Null means images are proxied through the
   * Worker instead, which works but costs an invocation per image.
   */
  publicBase: string | null;
}

export interface IPresignImageRequest {
  target: ImageTarget;
  contentType: string;
  /** Checked here as well as in the browser: the browser's check is advice. */
  size: number;
}

export interface IPresignImageResponse {
  /** What the database keeps. The URL to show it is computed from this on read,
   * so the base can change without touching a row. */
  key: string;
  /** PUT the bytes here. They never pass through this app. */
  uploadUrl: string;
  /** Headers the PUT must carry; the content type is part of the signature. */
  headers: Record<string, string>;
}