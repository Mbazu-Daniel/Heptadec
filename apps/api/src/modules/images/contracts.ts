export type ImageTarget = "avatar" | "logo";

export function avatarKeyPrefixFor(organizationId: string): string {
  return `avatars/${organizationId}/`;
}

export function logoKeyFor(organizationId: string): string {
  return `logos/${organizationId}`;
}


export interface IImagesConfigResponse {
  configured: boolean;
  publicBase: string | null;
}

export interface IPresignImageRequest {
  target: ImageTarget;
  contentType: string;
  size: number;
}

export interface IPresignImageResponse {
  key: string;
  uploadUrl: string;
  headers: Record<string, string>;
}