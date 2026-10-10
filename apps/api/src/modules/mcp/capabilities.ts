import { MCP_TOOLS, type McpTool } from "./contracts";
import { BadRequestException } from "../../common/exceptions";

export const MCP_CONFIG_ID = "mcp";

export const MCP_PERMISSION_RESOURCE = "mcp";

export function createPermissions(
  capabilities: readonly string[],
): Record<string, string[]> {
  return { [MCP_PERMISSION_RESOURCE]: capabilities.map((tool) => tool) };
}

export function assertValidCapabilities(capabilities: readonly string[]): void {
  const known: readonly string[] = MCP_TOOLS;
  const unknown = capabilities.filter(
    (capability) => !known.includes(capability),
  );
  if (unknown.length > 0) {
    throw new BadRequestException(`Unknown capability: ${unknown.join(", ")}`);
  }
}

export function hasToolPermission(
  permissions: Record<string, string[]> | null,
  tool: McpTool,
): boolean {
  const actions = permissions?.[MCP_PERMISSION_RESOURCE];
  return actions !== undefined && actions.includes(tool);
}
