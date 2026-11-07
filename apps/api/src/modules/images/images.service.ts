import type { IRequestScope } from "../../common/session/current-organization";
import { BadRequestException } from "../../common/exceptions/index";
import {
  avatarKeyPrefixFor,
  logoKeyFor,
  type IImagesConfigResponse,
  type IPresignImageResponse,
  type ImageTarget,
} from "./contracts";
import { publicBaseFrom } from "./urls";
import { presignUpload, type IUploadTarget } from "./presign";
import type { IImagesBindings, IPresignImageInput } from "./types";

const KEY_PREFIXES = ["avatars/", "logos/"];

type ISigner = Omit<IUploadTarget, "key" | "contentType">;

/**
 * Everything needed to sign, or null when this deployment cannot.
 *
 * The bucket binding is only half of it. Signing is an S3 operation, so it also
 * needs the account's R2 access key, which is a secret rather than a binding —
 * a deployment with the bucket but no key serves images it cannot replace, and
 * says so here rather than at the point of upload.
 */
export function signerFor(env: IImagesBindings): ISigner | null {
  const {
    R2_BUCKET_NAME,
    CLOUDFLARE_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_SESSION_TOKEN,
  } = env;
  // An unset variable arrives as "" from a .env file and as undefined from a
  // wrangler var, and both mean the same thing.
  if (
    !R2_BUCKET_NAME ||
    !CLOUDFLARE_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY
  ) {
    return null;
  }
  return {
    bucket: R2_BUCKET_NAME,
    accountId: CLOUDFLARE_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    sessionToken: R2_SESSION_TOKEN,
  };
}

export function requireSigner(env: IImagesBindings): ISigner {
  const signable = signerFor(env);
  if (signable === null) {
    throw new BadRequestException("Image storage is not configured on this deployment.");
  }
  return signable;
}

/** The key an image is stored under. Derived, never taken from input. */
function keyFor(target: ImageTarget, memberId: string, organizationId: string): string {
  return target === "avatar"
    ? `${avatarKeyPrefixFor(organizationId)}${memberId}`
    : logoKeyFor(organizationId);
}

export function imagesConfig(env: IImagesBindings): IImagesConfigResponse {
  return {
    // Whether an upload can be signed, which is the bucket's settings. It does
    // not depend on the binding: the Node server has no binding and can still
    // sign, because the bytes go to the bucket directly either way.
    configured: signerFor(env) !== null,
    publicBase: publicBaseFrom(env),
  };
}

export async function presignImage(
  organization: IRequestScope,
  signer: ISigner,
  input: IPresignImageInput,
): Promise<IPresignImageResponse> {
  // An avatar is keyed by membership, and the request's scope already carries
  // the caller's membership row. A logo is keyed by the organization.
  const membershipId =
    input.target === "avatar" ? organization.caller.id : organization.organizationId;

  const key = keyFor(input.target, membershipId, organization.organizationId);
  const upload = await presignUpload({ ...signer, key, contentType: input.contentType });

  return {
    key,
    uploadUrl: upload.url,
    headers: upload.headers,
  };
}

export async function readImageObject(
  env: IImagesBindings,
  key: string,
): Promise<R2ObjectBody | null> {
  return env.images !== undefined && KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
    ? await env.images.get(key)
    : null;
}
