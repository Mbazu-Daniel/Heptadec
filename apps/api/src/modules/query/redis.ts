import { createClient } from "redis";
import { BadGatewayException, BadRequestException } from "../../common/exceptions";
import { jsonValue } from "../../common/http/json-value";
import type { IStoredConnection } from "../data-source/connection";
import type { IRedisQueryResponse } from "./contracts";
import { applyBudget } from "./budget";

const STATEMENT_TIMEOUT_MS = 15_000;

const MAX_COMMAND_CHARS = 1_000;

const READ_ONLY_REDIS_COMMANDS = new Set([
  "exists", "keys", "scan", "type", "randomkey", "object", "dbsize", "ttl",
  "pttl", "command", "info",
  "get", "getrange", "strlen", "bitcount", "bitpos", "substr",
  "hexists", "hget", "hgetall", "hlen", "hmget", "hscan", "hkeys", "hstrlen",
  "hvals", "hrandfield",
  "llen", "lindex", "lrange", "lpos",
  "scard", "sdiff", "sinter", "sismember", "smembers", "srandmember", "sscan",
  "sunion",
  "zcard", "zcount", "zlexcount", "zmscore", "zrange", "zrangebylex",
  "zrangebyscore", "zrank", "zrevrange", "zrevrangebylex", "zrevrangebyscore",
  "zrevrank", "zscore", "zscan",
  "xlen", "xrange", "xrevrange", "xread", "xinfo", "xpending",
  "ping", "echo", "wait",
]);

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

function commandName(command: string): string {
  const trimmed = command.trim();
  const first = trimmed.search(/\s/);
  return first === -1 ? trimmed : trimmed.slice(0, first);
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
  const tokens = tokenize(trimmed);
  const name = commandName(trimmed).toLowerCase();
  if (!READ_ONLY_REDIS_COMMANDS.has(name)) {
    throw new BadRequestException(
      `Redis command \`${tokens[0] ?? ""}\` is not allowed on a read-only source`,
    );
  }

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
  } catch {
    throw new BadGatewayException("That Redis command could not be run");
  } finally {
    await client.quit().catch(() => undefined);
  }
}
