import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { schema } from "@heptadec/db";
import { requireSession, type IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions";
import { readBody, readString } from "../../common/http/body";
import { can } from "../rbac/authorize";
import type {
  IImagesConfigResponse,
  IPresignImageResponse,
  ImageTarget,
} from "./contracts";
import { presignUpload, type IUploadTarget } from "./presign";

const { member } = schema;

// The path the browser reads an object back from. Kept under /api so the
// Worker answers it instead of handing the request to the static assets.
const PATH_PREFIX = "/api/images/";

const KEY_PREFIXES = ["avatars/", "logos/"];

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// An avatar is stored at 128 pixels and a logo is shown at a few sizes, so a
// file larger than this is a phone camera rather than an image.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type IBindings = IAuthVars["Bindings"];

/**
 * Everything needed to sign, or null when this deployment cannot.
 *
 * The bucket binding is only half of it. Signing is an S3 operation, so it also
 * needs the account's R2 access key, which is a secret rather than a binding —
 * a deployment with the bucket but no key serves images it cannot replace, and
 * says so here rather than at the point of upload.
 */
function signer(env: IBindings): Omit<IUploadTarget, "key" | "contentType"> | null {
  const { R2BucketName, R2AccountId, R2AccessKeyId, R2SecretAccessKey, R2SessionToken } = env;
  if (
    R2BucketName === undefined ||
    R2AccountId === undefined ||
    R2AccessKeyId === undefined ||
    R2SecretAccessKey === undefined
  ) {
    return null;
  }
  return {
    bucket: R2BucketName,
    accountId: R2AccountId,
    accessKeyId: R2AccessKeyId,
    secretAccessKey: R2SecretAccessKey,
    sessionToken: R2SessionToken,
  };
}

function notConfigured(): BadRequestException {
  return new BadRequestException("Image storage is not configured on this deployment.");
}

/** The key an image is stored and read under. Derived, never taken from input. */
function keyFor(target: ImageTarget, memberId: string, organizationId: string): string {
  return target === "avatar"
    ? `avatars/${organizationId}/${memberId}`
    : `logos/${organizationId}`;
}

export function imageRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/images/config", (c) =>
    c.json<IImagesConfigResponse>({
      configured: signer(c.env) !== null && c.env.images !== undefined,
    }),
  );

  routes.post("/api/images/presign", requireSession, async (c) => {
    const signable = signer(c.env);
    if (signable === null) {
      throw notConfigured();
    }

    // Validated here, at the boundary, because this is the one request whose
    // fields decide what the browser is authorised to write. Past this line it
    // is the signature's problem.
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
    if (
      target === "logo" &&
      !(await can(organization.db, c.req.raw.headers, "organization", "update"))
    ) {
      throw new ForbiddenException("Only an owner can change the logo");
    }

    // An avatar is keyed by membership, so it needs the member row: the session
    // says which user, not which membership. A logo is keyed by the
    // organization, which the session already has.
    const [membership] =
      target === "avatar"
        ? await organization.db
            .select({ id: member.id })
            .from(member)
            .where(
              and(
                eq(member.userId, c.get("session")!.user.id),
                organization.where(member.organizationId),
              ),
            )
            .limit(1)
        : [{ id: organization.organizationId }];
    if (membership === undefined) {
      throw new ForbiddenException("You are not a member of that organization");
    }

    const key = keyFor(target, membership.id, organization.organizationId);
    const upload = await presignUpload({ ...signable, key, contentType });

    return c.json<IPresignImageResponse>({
      // One rule for both targets: the path is the key under the read prefix.
      path: `${PATH_PREFIX}${key}`,
      uploadUrl: upload.url,
      headers: upload.headers,
    });
  });

  routes.get("/api/images/*", async (c) => {
    const key = c.req.path.slice(PATH_PREFIX.length);
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