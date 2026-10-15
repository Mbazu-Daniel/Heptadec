/** Which image an upload is for. Decides the key and who may ask for it. */
export type ImageTarget = "avatar" | "logo";

/**
 * Where an organization's member avatars live.
 *
 * Scoped by organization as well as by user: an avatar is a property of a
 * membership, so the same person can have a different one in each organization,
 * and one organization's image cannot be pointed at another's.
 */
export function avatarPathPrefixFor(organizationId: string): string {
  return `/api/images/avatars/${organizationId}/`;
}

export function avatarPathFor(organizationId: string, userId: string): string {
  return `${avatarPathPrefixFor(organizationId)}${userId}`;
}

export interface IImagesConfigResponse {
  /**
   * Whether this deployment can sign an upload. A bucket binding is not enough:
   * the signature needs the R2 S3 credentials, which are secrets rather than
   * bindings. Reported so the upload control can say so at the point of use.
   */
  configured: boolean;
}

export interface IPresignImageRequest {
  target: ImageTarget;
  contentType: string;
  /** Checked here as well as in the browser: the browser's check is advice. */
  size: number;
}

export interface IPresignImageResponse {
  /** What the database keeps: the path this image is read back from. */
  path: string;
  /** PUT the bytes here. They never pass through this app. */
  uploadUrl: string;
  /** Headers the PUT must carry; the content type is part of the signature. */
  headers: Record<string, string>;
}