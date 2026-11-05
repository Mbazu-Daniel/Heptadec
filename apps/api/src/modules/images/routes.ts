import { Hono } from "hono";
import { requireSession, type IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import {
  BadRequestException,
  NotFoundException,
} from "../../common/exceptions";
import { readBody, readString } from "../../common/http/body";
import { requireOwner } from "../rbac/owner";
import {
  avatarKeyPrefixFor,
  logoKeyFor,
  type IImagesConfigResponse,
  type IPresignImageResponse,
  type ImageTarget,
} from "./contracts";
import { MEDIA_PATH_PREFIX, publicBaseFrom } from "./urls";
import { presignUpload, type IUploadTarget } from "./presign";

const KEY_PREFIXES = ["avatars/", "logos/"];

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type IBindings = IAuthVars["Bindings"];

function signer(env: IBindings): Omit<IUploadTarget, "key" | "contentType"> | null {
  const {
    R2_BUCKET_NAME,
    CLOUDFLARE_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_SESSION_TOKEN,
  } = env;
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

function notConfigured(): BadRequestException {
  return new BadRequestException("Image storage is not configured on this deployment.");
}

function keyFor(target: ImageTarget, memberId: string, organizationId: string): string {
  return target === "avatar"
    ? `${avatarKeyPrefixFor(organizationId)}${memberId}`
    : logoKeyFor(organizationId);
}

export function imageRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/images/config", (c) =>
    c.json<IImagesConfigResponse>({
      configured: signer(c.env) !== null,
      publicBase: publicBaseFrom(c.env),
    }),
  );

  routes.post("/api/images/presign", requireSession, async (c) => {
    const signable = signer(c.env);
    if (signable === null) {
      throw notConfigured();
    }

    const body = readBody(await c.req.json(), "That upload could not be read.");
    const target = readString(body, "target", "An image is required.", 16);
    if (target !== "avatar" && target !== "logo") {
      throw new BadRequestException("That image target is not one we know.");
    }
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

    const membershipId =
      target === "avatar" ? organization.caller.id : organization.organizationId;

    const key = keyFor(target, membershipId, organization.organizationId);
    const upload = await presignUpload({ ...signable, key, contentType });

    return c.json<IPresignImageResponse>({
      key,
      uploadUrl: upload.url,
      headers: upload.headers,
    });
  });

  routes.get("/api/images/*", async (c) => {
    const key = c.req.path.slice(MEDIA_PATH_PREFIX.length);
    const object =
      c.env.images !== undefined && KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
        ? await c.env.images.get(key)
        : null;
    if (object === null) {
      throw new NotFoundException("That image does not exist");
    }
    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
        "cache-control": "public, max-age=300",
      },
    });
  });

  return routes;
}