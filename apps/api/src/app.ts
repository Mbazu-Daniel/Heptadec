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

/**
 * What a module's routes are behind.
 *
 * "product" — the routes are the product, and each one needs an entitlement.
 * The Subscription Gate holds the whole module, so a route added to it later is
 * gated without anyone remembering to.
 *
 * "admin" — the routes need a session but not a subscription: signing in,
 * administering the organization, and paying.
 *
 * "self" — the routes serve somebody the app does not sign in: a public share
 * link, an MCP token. Such a module cannot be wrapped, because the gate would
 * refuse a request that carries no session, so it checks its own organization.
 */
type ModuleGate = "product" | "admin" | "self";

interface IAppModule {
  readonly gate: ModuleGate;
  readonly routes: () => Hono<IAuthVars>;
}

const MODULES: readonly IAppModule[] = [
  { gate: "admin", routes: authRoutes },
  { gate: "product", routes: auditRoutes },
  { gate: "product", routes: dataSourceRoutes },
  { gate: "product", routes: queryRoutes },
  { gate: "product", routes: schemaRoutes },
  { gate: "product", routes: savedQueryRoutes },
  { gate: "product", routes: dashboardRoutes },
  { gate: "product", routes: dashboardAiRoutes },
  { gate: "product", routes: shareLinkRoutes },
  { gate: "self", routes: publicShareRoutes },
  { gate: "product", routes: schedulerRoutes },
  { gate: "product", routes: alertRoutes },
  { gate: "product", routes: notificationRoutes },
  { gate: "admin", routes: organizationRoutes },
  { gate: "admin", routes: memberRoutes },
  { gate: "admin", routes: imageRoutes },
  { gate: "admin", routes: billingRoutes },
  { gate: "admin", routes: invitationRoutes },
  { gate: "self", routes: mcpRoutes },
  { gate: "product", routes: aiRoutes },
];

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

  for (const appModule of MODULES) {
    const routes = appModule.routes();
    app.route(
      "/",
      appModule.gate === "product" ? subscribed(routes) : routes,
    );
  }

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