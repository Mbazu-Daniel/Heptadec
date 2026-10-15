import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { IAuthVars } from "../../common/middleware/require-session";
import { requireSession } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import type { IOrganizationScope } from "../../common/session/current-organization";
import { authFor } from "../../common/config/better-auth";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  TooManyRequestsException,
} from "../../common/exceptions";
import { readBody, readString } from "../../common/http/body";
import { can } from "../rbac/authorize";
import { recordAudit, auditActor } from "../audit";
import { authenticateMcpKey } from "./auth";
import {
  MCP_CONFIG_ID,
  MCP_PERMISSION_RESOURCE,
  assertValidCapabilities,
  createPermissions,
} from "./capabilities";
import type {
  ICreateMcpTokenResponse,
  IMcpToken,
  IMcpTokenListResponse,
  IRevokeMcpTokenResponse,
} from "./contracts";
import { registerTools } from "./tools";

const MAX_NAME = 60;

const RATE_LIMIT_REQUESTS = 120;

const RATE_LIMIT_WINDOW_MS = 60_000;

const tokenRequests = new Map<string, { count: number; since: number }>();

function rateLimit(tokenId: string): void {
  const now = Date.now();
  for (const [key, entry] of tokenRequests) {
    if (now - entry.since >= RATE_LIMIT_WINDOW_MS) {
      tokenRequests.delete(key);
    }
  }
  const entry = tokenRequests.get(tokenId);
  if (entry === undefined || now - entry.since >= RATE_LIMIT_WINDOW_MS) {
    if (tokenRequests.size >= 10_000) {
      tokenRequests.clear();
    }
    tokenRequests.set(tokenId, { count: 1, since: now });
    return;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_REQUESTS) {
    throw new TooManyRequestsException(
      "That token is asking too often — try again in a minute",
    );
  }
}

export function mcpRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.post("/api/mcp-tokens", requireSession, async (c) => {
    const organization = activeOrganization(c);
    if (!(await can(organization.db, c.req.raw.headers, "apiKey", "create"))) {
      throw new ForbiddenException("Only owners can create MCP tokens");
    }

    const raw = readBody(await c.req.json(), "A name is required");
    const name = readString(raw, "name", "A name is required");
    if (name.length > MAX_NAME) {
      throw new BadRequestException(`Keep the name under ${MAX_NAME} characters`);
    }
    const capabilities = readCapabilities(raw);

    const session = c.get("session");
    const created = await authFor(organization.db).api.createApiKey({
      body: {
        configId: MCP_CONFIG_ID,
        name,
        organizationId: organization.organizationId,
        permissions: createPermissions(capabilities),
        userId: session?.user.id,
      },
    });
    const body: ICreateMcpTokenResponse = {
      ...toToken(created),
      token: created.key,
    };

    const actor = auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "mcp_token.created",
      targetKind: "mcp_token",
      targetId: created.id,
      targetLabel: name,
      detail: capabilities.join(", "),
    });

    return c.json(body, 201);
  });

  routes.get("/api/mcp-tokens", requireSession, async (c) => {
    const organization = activeOrganization(c);
    if (!(await can(organization.db, c.req.raw.headers, "apiKey", "read"))) {
      throw new ForbiddenException("Only owners can see MCP tokens");
    }

    const result = await authFor(organization.db).api.listApiKeys({
      query: {
        organizationId: organization.organizationId,
        configId: MCP_CONFIG_ID,
      },
      headers: c.req.raw.headers,
    });
    const body: IMcpTokenListResponse = {
      tokens: result.apiKeys.map(toToken),
    };
    return c.json(body);
  });

  routes.delete("/api/mcp-tokens/:id", requireSession, async (c) => {
    const organization = activeOrganization(c);
    if (!(await can(organization.db, c.req.raw.headers, "apiKey", "delete"))) {
      throw new ForbiddenException("Only owners can revoke MCP tokens");
    }

    const result = await authFor(organization.db).api.updateApiKey({
      body: {
        configId: MCP_CONFIG_ID,
        keyId: c.req.param("id"),
        enabled: false,
      },
      headers: c.req.raw.headers,
    });

    if (result.referenceId !== organization.organizationId) {
      throw new NotFoundException("That MCP token does not exist");
    }

    const actor = auditActor(c);
    await recordAudit(organization.db, {
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "mcp_token.revoked",
      targetKind: "mcp_token",
      targetId: result.id,
      targetLabel: result.name ?? undefined,
    });

    const body: IRevokeMcpTokenResponse = { revoked: result.id };
    return c.json(body);
  });

  routes.all("/mcp", async (c) => {
    const principal = await authenticateMcpKey(c.get("db"), c.req.header("authorization"));
    rateLimit(principal.keyId);

    const server = new McpServer({ name: "heptadec", version: "0.0.0" });
    registerTools(server, principal, principal.permissions);

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);
    try {
      return await transport.handleRequest(c.req.raw);
    } finally {
      await server.close();
      await transport.close();
    }
  });

  return routes;
}

function toToken(row: {
  id: string;
  name: string | null;
  createdAt: Date;
  lastRequest: Date | null;
  enabled: boolean;
  permissions: Record<string, string[]> | null;
}): IMcpToken {
  return {
    id: row.id,
    name: row.name ?? "",
    createdAt: row.createdAt.toISOString(),
    lastRequest: row.lastRequest?.toISOString() ?? null,
    enabled: row.enabled,
    capabilities: row.permissions?.[MCP_PERMISSION_RESOURCE] ?? [],
  };
}

function readCapabilities(raw: Record<string, unknown>): string[] {
  const capabilities = raw["capabilities"];
  if (!Array.isArray(capabilities) || capabilities.length === 0) {
    throw new BadRequestException("At least one capability is required");
  }
  if (capabilities.some((capability) => typeof capability !== "string")) {
    throw new BadRequestException("Capabilities must be text");
  }
  const list = capabilities as string[];
  assertValidCapabilities(list);
  return list;
}
