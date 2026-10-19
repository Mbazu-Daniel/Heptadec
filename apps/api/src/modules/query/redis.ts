import { createClient } from "redis";
import { BadGatewayException, BadRequestException } from "../../common/exceptions";
import { driverFailure } from "../../common/driver-error";
import { jsonValue } from "../../common/http/json-value";
import type { IStoredConnection } from "../data-source/connection";
import type { IRedisQueryResponse } from "./contracts";
import { applyBudget } from "./budget";
import { assertRedisReads } from "./read-policy";

const STATEMENT_TIMEOUT_MS = 15_000;

const MAX_COMMAND_CHARS = 1_000;

function redisUrl(source: IStoredConnection): string {
  if (source.host === null || source.port === null) {
    throw new BadRequestException("That source is missing connection details");
  }
  const username = source.username ?? "default";
  const password = source.password;
  const auth = username && password
    ? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
    : username
      ? `${encodeURIComponent(username)}@`
      : "";
  const scheme = source.connectionMode === "tls" ? "rediss" : "redis";
  const database = source.database === null ? "" : `/${source.database}`;
  return `${scheme}://${auth}${source.host}:${source.port}${database}`;
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes: "\"" | "'" | null = null;
  for (const ch of command) {
    if (inQuotes !== null) {
      if (ch === inQuotes) {
        inQuotes = null;
      } else {
        current += ch;
      }
    } else if (ch === "\"" || ch === "'") {
      inQuotes = ch;
    } else if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

function toGrid(result: unknown): {
  columns: string[];
  rows: Array<Record<string, unknown>>;
} {
  if (result !== null && typeof result === "object" && !Array.isArray(result)) {
    return {
      columns: ["field", "value"],
      rows: Object.entries(result).map(([field, value]) => ({
        field,
        value: jsonValue(value),
      })),
    };
  }
  if (!Array.isArray(result)) {
    return { columns: ["value"], rows: [{ value: jsonValue(result) }] };
  }
  if (result.every((item) => item === null || typeof item !== "object")) {
    return {
      columns: ["value"],
      rows: result.map((item) => ({ value: jsonValue(item) })),
    };
  }
  return { columns: ["value"], rows: result.map((cell) => ({ value: jsonValue(cell) })) };
}

export async function runRedisQuery(
  source: IStoredConnection,
  command: string,
): Promise<IRedisQueryResponse> {
  const trimmed = command.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_COMMAND_CHARS) {
    throw new BadRequestException("A Redis command is required");
  }
  assertRedisReads(trimmed, source.readOnly);
  const tokens = tokenize(trimmed);

  const client = createClient({ url: redisUrl(source) });
  const startedAt = Date.now();
  try {
    await client.connect();
    const result = await client.sendCommand(tokens, {
      abortSignal: AbortSignal.timeout(STATEMENT_TIMEOUT_MS),
    });
    const grid = toGrid(result);
    const budgeted = applyBudget(grid.rows);
    return {
      columns: grid.columns,
      rows: budgeted.rows,
      truncated: budgeted.truncated,
      durationMs: Date.now() - startedAt,
    };
  } catch (caught) {
    throw new BadGatewayException(
      driverFailure(caught, "run that Redis command") ??
        "That Redis command could not be run",
    );
  } finally {
    await client.quit().catch(() => undefined);
  }
}
