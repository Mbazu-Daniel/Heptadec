import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  type HeptadecDatabase,
} from "@heptadec/db";
import type { IOrganizationScope } from "../../common/session/current-organization";
import { authFor } from "../../common/config/better-auth";
import {
  NotFoundException,
  TooManyRequestsException,
} from "../../common/exceptions/index";
import { authenticateMcpKey } from "./auth";
import {
  MCP_CONFIG_ID,
  MCP_PERMISSION_RESOURCE,
  createPermissions,
} from "./capabilities";
import type {
  ICreateMcpTokenResponse,
  IMcpToken,
  IMcpTokenListResponse,
} from "./contracts";
import type {
  ICreateMcpTokenInput,
  IMcpTokenRow,
  IRevokedMcpToken,
} from "./types";
import { registerTools } from "./tools";

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

export async function createMcpToken(
  organization: IOrganizationScope,
  input: ICreateMcpTokenInput,
): Promise<{ response: ICreateMcpTokenResponse; capabilities: string[] }> {
  const created = await authFor(organization.db).api.createApiKey({
    body: {
      configId: MCP_CONFIG_ID,
      name: input.name,
      organizationId: organization.organizationId,
      permissions: createPermissions(input.capabilities),
      userId: input.userId,
    },
  });
  const response: ICreateMcpTokenResponse = {
    ...toToken(created),
    token: created.key,
  };

  return { response, capabilities: input.capabilities };
}

export async function listMcpTokens(
  organization: IOrganizationScope,
  headers: Headers,
): Promise<IMcpTokenListResponse> {
  const result = await authFor(organization.db).api.listApiKeys({
    query: {
      organizationId: organization.organizationId,
      configId: MCP_CONFIG_ID,
    },
    headers,
  });
  return {
    tokens: result.apiKeys.map(toToken),
  };
}

export async function revokeMcpToken(
  organization: IOrganizationScope,
  headers: Headers,
  tokenId: string,
): Promise<IRevokedMcpToken> {
  const result = await authFor(organization.db).api.updateApiKey({
    body: {
      configId: MCP_CONFIG_ID,
      keyId: tokenId,
      enabled: false,
    },
    headers,
  });

  if (result.referenceId !== organization.organizationId) {
    throw new NotFoundException("That MCP token does not exist");
  }

  return { id: result.id, name: result.name };
}

export async function handleMcpRequest(
  db: HeptadecDatabase,
  authorization: string | undefined,
  raw: Request,
): Promise<Response> {
  const principal = await authenticateMcpKey(db, authorization);
  rateLimit(principal.keyId);

  const server = new McpServer({ name: "heptadec", version: "0.0.0" });
  registerTools(server, principal, principal.permissions);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  try {
    return await transport.handleRequest(raw);
  } finally {
    await server.close();
    await transport.close();
  }
}

function toToken(row: IMcpTokenRow): IMcpToken {
  return {
    id: row.id,
    name: row.name ?? "",
    createdAt: row.createdAt.toISOString(),
    lastRequest: row.lastRequest?.toISOString() ?? null,
    enabled: row.enabled,
    capabilities: row.permissions?.[MCP_PERMISSION_RESOURCE] ?? [],
  };
}
