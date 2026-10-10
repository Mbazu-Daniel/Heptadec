export const MCP_TOOLS = [
  "list_data_sources",
  "describe_data_source",
  "run_query",
  "preview_data_source",
] as const;

export type McpTool = (typeof MCP_TOOLS)[number];

export interface IMcpToken {
  id: string;
  name: string;
  createdAt: string;
  lastRequest: string | null;
  enabled: boolean;
  capabilities: string[];
}

export interface IMcpTokenListResponse {
  tokens: IMcpToken[];
}

export interface ICreateMcpTokenRequest {
  name: string;
  capabilities: string[];
}

export interface ICreateMcpTokenResponse extends IMcpToken {
  token: string;
}

export interface IUpdateMcpTokenRequest {
  name?: string;
  enabled?: boolean;
  capabilities?: string[];
}

export interface IRevokeMcpTokenResponse {
  revoked: string;
}
