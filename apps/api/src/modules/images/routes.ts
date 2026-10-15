import { Hono } from "hono";
import { requireSession, type IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "../../common/exceptions";
import { readBody, readString } from "../../common/http/body";
import { can } from "../rbac/authorize";
import type { IImagesConfigResponse, IUploadImageResponse } from "./contracts";

// The path the browser reads an object back from. Kept under /api so the
// Worker answers it instead of handing the request to the static assets.
const PATH_PREFIX = "/api/images/";

const KEY_PREFIXES = ["avatars/", "logos/"];

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

interface IDecodedImage {
  bytes: Uint8Array;
  contentType: string;
}

// A client controls everything in a data URL, so the shape and the media type
// are checked here, at the boundary, before anything is written to the bucket.
function decodeImage(dataUrl: string): IDecodedImage {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (match === null) {
    throw new BadRequestException("That file is not a valid image.");
  }
  const contentType = match[1]!;
  if (!IMAGE_TYPES.includes(contentType)) {
    throw new BadRequestException(
      "Only PNG, JPEG, WebP and GIF images are accepted.",
    );
  }
  const binary = atob(match[2]!);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return { bytes, contentType };
}

async function putImage(
  bucket: R2Bucket | undefined,
  key: string,
  dataUrl: string,
): Promise<IUploadImageResponse> {
  // A deployment with no bucket binding has no image storage, and it says so
  // here rather than failing somewhere further down the stack.
  if (bucket === undefined) {
    throw new BadRequestException(
      "Image storage is not configured on this deployment.",
    );
  }
  const image = decodeImage(dataUrl);
  await bucket.put(key, image.bytes, {
    httpMetadata: { contentType: image.contentType },
  });
  return { path: `${PATH_PREFIX}${key}` };
}

export function imageRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/images/config", (c) =>
    c.json<IImagesConfigResponse>({
      configured: c.env.images !== undefined,
    }),
  );

  routes.post("/api/images/avatar", requireSession, async (c) => {
    const session = c.get("session")!;
    const body = readBody(await c.req.json(), "That image could not be read.");
    const dataUrl = readString(body, "dataUrl", "An image is required.");
    return c.json(
      await putImage(c.env.images, `avatars/${session.user.id}`, dataUrl),
    );
  });

  routes.post("/api/images/logo", requireSession, async (c) => {
    const organization = activeOrganization(c);
    if (!(await can(organization.db, c.req.raw.headers, "organization", "update"))) {
      throw new ForbiddenException("Only an owner can change the logo");
    }
    const body = readBody(await c.req.json(), "That image could not be read.");
    const dataUrl = readString(body, "dataUrl", "An image is required.");
    return c.json(
      await putImage(
        c.env.images,
        `logos/${organization.organizationId}`,
        dataUrl,
      ),
    );
  });

  routes.get("/api/images/*", async (c) => {
    const key = c.req.path.slice(PATH_PREFIX.length);
    const object =
      c.env.images !== undefined &&
      KEY_PREFIXES.some((prefix) => key.startsWith(prefix))
        ? await c.env.images.get(key)
        : null;
    if (object === null) {
      throw new NotFoundException("That image does not exist");
    }
    return new Response(object.body, {
      headers: {
        "content-type":
          object.httpMetadata?.contentType ?? "application/octet-stream",
        "cache-control": "public, max-age=300",
      },
    });
  });

  return routes;
}
