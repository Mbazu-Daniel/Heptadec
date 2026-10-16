import { and, eq } from "drizzle-orm";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import { authFor } from "../../common/config/better-auth";
import { UnauthorizedException } from "../../common/exceptions";
import {
  organizationScope,
  type IOrganizationScope,
} from "../../common/session/current-organization";
import { isBetterAuthError } from "../../common/exceptions/from-better-auth";
import { MCP_CONFIG_ID } from "./capabilities";

const { member } = schema;

export interface IMcpPrincipal extends IOrganizationScope {
  keyId: string;
  permissions: Record<string, string[]> | null;
}

export async function authenticateMcpKey(
  db: HeptadecDatabase,
  authorization: string | undefined,
): Promise<IMcpPrincipal> {
  const token = bearerToken(authorization);
  if (token === null) {
    throw new UnauthorizedException("That MCP token is not valid");
  }

  let key: {
    id: string;
    referenceId: string;
    permissions: Record<string, string[]> | null;
  };
  try {
    const verified = await authFor(db).api.verifyApiKey({
      body: { key: token, configId: MCP_CONFIG_ID },
    });
    if (!verified.valid) {
      throw new UnauthorizedException("That MCP token is not valid");
    }
    if (verified.key == null) {
      throw new UnauthorizedException("That MCP token is not valid");
    }
    key = {
      id: verified.key.id,
      referenceId: verified.key.referenceId,
      permissions: verified.key.permissions ?? null,
    };
  } catch (error) {
    if (isBetterAuthError(error)) {
      throw new UnauthorizedException("That MCP token is not valid");
    }
    throw error;
  }

  const organizationId = key.referenceId;
  const owner = await db
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.role, "owner"), eq(member.organizationId, organizationId)))
    .limit(1);
  if (owner.length === 0) {
    throw new UnauthorizedException("That MCP token is not valid");
  }

  return {
    ...organizationScope(db, organizationId),
    keyId: key.id,
    permissions: key.permissions,
  };
}

function bearerToken(authorization: string | undefined): string | null {
  if (authorization === undefined) {
    return null;
  }
  const match = /^Bearer (\S+)$/.exec(authorization);
  return match === null ? null : match[1]!;
}
