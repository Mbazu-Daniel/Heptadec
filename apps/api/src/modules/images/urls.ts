import type { IAuthVars } from "../../common/middleware/require-session";

export const MEDIA_PATH_PREFIX = "/api/images/";

export function publicBaseFrom(env: IAuthVars["Bindings"]): string | null {
  const custom = env.R2_CUSTOM_DOMAIN?.trim();
  if (custom !== undefined && custom !== "") {
    return /^https?:\/\//.test(custom) ? custom : `https://${custom}`;
  }
  const id = env.R2_PUBLIC_ID?.trim();
  return id === undefined || id === "" ? null : `https://pub-${id}.r2.dev`;
}

export function mediaUrl(key: string | null, publicBase: string | null): string | null {
  if (key === null || key === "") {
    return null;
  }
  return publicBase === null ? `${MEDIA_PATH_PREFIX}${key}` : `${publicBase}/${key}`;
}