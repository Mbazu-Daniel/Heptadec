import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { MAX_BODY_BYTES } from "./common/constants";
import {
  BadRequestException,
  InternalServerException,
  NotFoundException,
  PayloadTooLargeException,
  toErrorResponse,
} from "./common/exceptions";
import {
  fromBetterAuth,
  isBetterAuthError,
} from "./common/exceptions/from-better-auth";
import type { IAuthVars } from "./common/middleware/require-session";
import { database } from "./common/middleware/database";
import { auditRoutes } from "./modules/audit";
import { authRoutes } from "./modules/auth";
import { dataSourceRoutes } from "./modules/data-source";
import { queryRoutes } from "./modules/query";
import { schemaRoutes } from "./modules/schema";
import { savedQueryRoutes } from "./modules/saved-query";
import { dashboardRoutes, dashboardAiRoutes } from "./modules/dashboard";
import { shareLinkRoutes, publicShareRoutes } from "./modules/share-link";
import { schedulerRoutes } from "./modules/scheduler";
import { alertRoutes } from "./modules/alert";
import { notificationRoutes } from "./modules/notification";
import { invitationRoutes } from "./modules/invitation";
import { mcpRoutes } from "./modules/mcp";
import { aiRoutes } from "./modules/ai";
import { memberRoutes } from "./modules/member";
import { organizationRoutes } from "./modules/organization";
import { imageRoutes } from "./modules/images";
import { billingRoutes, subscribed } from "./modules/billing";

export interface IAppOptions {
  compressResponses: boolean;
}

export function buildApp(options: IAppOptions): Hono<IAuthVars> {
  const app = new Hono<IAuthVars>();

  app.use(logger());
  app.use(database);
  app.use(secureHeaders());
  app.use(
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => {
        throw new PayloadTooLargeException();
      },
    }),
  );
  if (options.compressResponses) {
    app.use(compress());
  }

  app.route("/", authRoutes());

  app.route("/", subscribed(auditRoutes()));
  app.route("/", subscribed(dataSourceRoutes()));
  app.route("/", subscribed(queryRoutes()));
  app.route("/", subscribed(schemaRoutes()));
  app.route("/", subscribed(savedQueryRoutes()));
  app.route("/", subscribed(dashboardRoutes()));
  app.route("/", subscribed(dashboardAiRoutes()));
  app.route("/", subscribed(shareLinkRoutes()));
  app.route("/", publicShareRoutes());
  app.route("/", subscribed(schedulerRoutes()));
  app.route("/", subscribed(alertRoutes()));
  app.route("/", subscribed(notificationRoutes()));
  app.route("/", organizationRoutes());
  app.route("/", memberRoutes());
  app.route("/", imageRoutes());
  app.route("/", billingRoutes());
  app.route("/", invitationRoutes());
  app.route("/", mcpRoutes());
  app.route("/", subscribed(aiRoutes()));

  app.get("/health", (c) => c.json({ ok: true }));

  app.notFound(() => {
    throw new NotFoundException("Route not found");
  });

  app.onError((error, c) => {
    const mapped = isBetterAuthError(error) ? fromBetterAuth(error) : null;
    if (mapped) {
      const { status, body } = toErrorResponse(mapped);
      return c.json(body, status);
    }
    if (error instanceof HTTPException) {
      const { status, body } = toErrorResponse(error);
      return c.json(body, status);
    }
    if (error instanceof SyntaxError) {
      const { status, body } = toErrorResponse(
        new BadRequestException("That request body is not valid JSON"),
      );
      return c.json(body, status);
    }
    console.error("[api] unhandled error:", error);
    const { status, body } = toErrorResponse(new InternalServerException());
    return c.json(body, status);
  });

  return app;
}