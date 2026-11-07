export interface ICreateMcpTokenInput {
  name: string;
  capabilities: string[];
  userId: string | undefined;
}

export interface IMcpTokenRow {
  id: string;
  name: string | null;
  createdAt: Date;
  lastRequest: Date | null;
  enabled: boolean;
  permissions: Record<string, string[]> | null;
}

export interface IRevokedMcpToken {
  id: string;
  name: string | null;
}
