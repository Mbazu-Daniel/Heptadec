import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import {
  BadRequestException,
  NotFoundException,
} from "../../common/exceptions/index";
import { readBody, readString } from "../../common/http/body";
import { requireOwner } from "../rbac/owner";
import type {
  IPresignImageResponse,
  ImageTarget,
} from "./contracts";
import { MEDIA_PATH_PREFIX } from "./urls";
import {
  imagesConfig,
  presignImage,
  readImageObject,
  requireSigner,
} from "./images.service";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// An avatar is stored at 128 pixels and a logo is shown at a few sizes, so a
// file larger than this is a phone camera rather than an image.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export function imagesConfigHandler(c: Context<IAuthVars>) {
  return c.json(imagesConfig(c.env));
}

export async function presignImageHandler(c: Context<IAuthVars>) {
  const signable = requireSigner(c.env);

  // Validated here, at the boundary, because this is the one request whose
  // fields decide what the browser is authorised to write. Past this line it
  // is the signature's problem.
  const body = readBody(await c.req.json(), "That upload could not be read.");
  const targetValue = readString(body, "target", "An image is required.", 16);
  if (targetValue !== "avatar" && targetValue !== "logo") {
    throw new BadRequestException("That image target is not one we know.");
  }
  const target: ImageTarget = targetValue;
  const contentType = readString(body, "contentType", "An image is required.", 64).trim();
  if (!IMAGE_TYPES.includes(contentType)) {
    throw new BadRequestException("Only PNG, JPEG, WebP and GIF images are accepted.");
  }
  const size = body.size;
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    throw new BadRequestException("That upload could not be measured.");
  }
  if (size > MAX_IMAGE_BYTES) {
    throw new BadRequestException("That image is larger than 2 MB.");
  }

  const organization = activeOrganization(c);
  if (target === "logo") {
    requireOwner(c, "Only an owner can change the logo");
  }

  return c.json<IPresignImageResponse>(
    await presignImage(organization, signable, { target, contentType }),
  );
}

// Only reached when the deployment has no public base. With one, the browser
// loads objects from the bucket directly and this never runs.
export async function serveImageHandler(c: Context<IAuthVars>) {
  const key = c.req.path.slice(MEDIA_PATH_PREFIX.length);
  const object = await readImageObject(c.env, key);
  if (object === null) {
    throw new NotFoundException("That image does not exist");
  }
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=300",
    },
  });
}
