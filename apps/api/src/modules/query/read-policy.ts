import { BadRequestException } from "../../common/exceptions";
import type { IMongoPipeline } from "./contracts";

export type ReadPurpose = "run" | "draft-preview";

const RUN_SQL = /^\s*(select|with|show|describe|desc|explain|pragma|values)\b/i;

const CHART_SQL = /^\s*(select|with)\b/i;

const WRITING_MONGO_STAGES = ["$out", "$merge"];

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

export function assertSqlReads(statement: string, purpose: ReadPurpose): void {
  const allowed = purpose === "draft-preview" ? CHART_SQL : RUN_SQL;
  if (allowed.test(statement)) {
    return;
  }
  throw new BadRequestException(
    purpose === "draft-preview"
      ? "That chart's statement is not a read"
      : "Only read-only statements can run here — that one writes",
  );
}

export function assertMongoReads(pipeline: IMongoPipeline): void {
  for (const stage of pipeline.pipeline) {
    const name = Object.keys(stage)[0] ?? "";
    if (WRITING_MONGO_STAGES.includes(name)) {
      throw new BadRequestException(
        `Only read-only pipelines can run here — ${name} writes a collection`,
      );
    }
  }
}

export function assertRedisReads(command: string, readOnly: boolean): void {
  const first = command.trim().search(/\s/);
  const name =
    first === -1
      ? command.trim().toLowerCase()
      : command.trim().slice(0, first).toLowerCase();
  if (READ_ONLY_REDIS_COMMANDS.has(name)) {
    return;
  }
  throw new BadRequestException(
    readOnly
      ? `Redis command \`${name}\` is not allowed on a read-only source`
      : `Redis command \`${name}\` is not a read command`,
  );
}
