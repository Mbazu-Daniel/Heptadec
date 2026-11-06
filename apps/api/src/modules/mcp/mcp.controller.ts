import type { Context } from "hono";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import { readBody, readString } from "../../common/http/body";
import { BadRequestException } from "../../common/exceptions/index";
import { requireOwner } from "../rbac/owner";
import { recordAudit } from "../audit/index";
import { assertValidCapabilities } from "./capabilities";
import {
  createMcpToken,
  handleMcpRequest,
  listMcpTokens,
  revokeMcpToken,
} from "./mcp.service";

const MAX_NAME = 60;

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

export async function createMcpTokenHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  requireOwner(c, "Only owners can create MCP tokens");

  const raw = readBody(await c.req.json(), "A name is required");
  const name = readString(raw, "name", "A name is required");
  if (name.length > MAX_NAME) {
    throw new BadRequestException(`Keep the name under ${MAX_NAME} characters`);
  }
  const capabilities = readCapabilities(raw);

  const session = c.get("session");
  const { response, capabilities: granted } = await createMcpToken(
    organization,
    { name, capabilities, userId: session?.user.id },
  );

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "mcp_token.created",
    targetKind: "mcp_token",
    targetId: response.id,
    targetLabel: name,
    detail: granted.join(", "),
  });

  return c.json(response, 201);
}

export async function listMcpTokensHandler(c: Context<IAuthVars>) {
  const organization = activeOrganization(c);
  requireOwner(c, "Only owners can see MCP tokens");

  return c.json(await listMcpTokens(organization, c.req.raw.headers));
}

export async function revokeMcpTokenHandler(
  c: Context<IAuthVars, "/api/v1/organization/:organizationId/mcp-tokens/:id">,
) {
  const organization = activeOrganization(c);
  requireOwner(c, "Only owners can revoke MCP tokens");

  const revoked = await revokeMcpToken(
    organization,
    c.req.raw.headers,
    c.req.param("id"),
  );

  await recordAudit(c, {
    organizationId: organization.organizationId,
    event: "mcp_token.revoked",
    targetKind: "mcp_token",
    targetId: revoked.id,
    targetLabel: revoked.name ?? undefined,
  });

  return c.json({ revoked: revoked.id });
}

export async function mcpHandler(c: Context<IAuthVars>) {
  return handleMcpRequest(
    c.get("db"),
    c.req.header("authorization"),
    c.req.raw,
  );
}
