import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { MAX_BODY_BYTES } from "./common/constants";
import {
  InternalServerException,
  NotFoundException,
  PayloadTooLargeException,
  toErrorResponse,
} from "./common/exceptions";
import type { IAuthVars } from "./common/middleware/require-session";
import { authRoutes } from "./modules/auth";

export function buildApp(): Hono<IAuthVars> {
  const app = new Hono<IAuthVars>();

  app.use(logger());
  app.use(secureHeaders());
  app.use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new PayloadTooLargeException();
      },
    }),
  );
  app.use(compress());

  app.route("/", authRoutes());

  app.get("/health", (c) => c.json({ ok: true }));

  app.notFound(() => {
    throw new NotFoundException("Route not found");
  });

  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      const { status, body } = toErrorResponse(error);
      return c.json(body, status);
    }
    console.error("[api] unhandled error:", error);
    const { status, body } = toErrorResponse(new InternalServerException());
    return c.json(body, status);
  });

  return app;
}