import type { DataSourceKind } from "@heptadec/api/data-source-contracts";

/**
 * The connection URL split into its parts, e.g. `{ host, port, username,
 * password, database }`. Only the parts the URL actually carries are set.
 * A URL that cannot be parsed yields an empty record.
 */
export function parseConnectionUrl(
  url: string,
  kind: DataSourceKind,
): Record<string, string> {
  const result: Record<string, string> = {};

  try {
    // SQLite takes a bare file path with no scheme at all.
    if (kind === "sqlite" && !url.includes("://")) {
      result.path = url;
      return result;
    }

    const parsed = new URL(url);

    if (parsed.username) {
      result.username = decodeURIComponent(parsed.username);
    }
    if (parsed.password) {
      result.password = decodeURIComponent(parsed.password);
    }

    result.host = parsed.hostname;

    if (parsed.port) {
      result.port = parsed.port;
    }

    if (kind === "sqlite") {
      result.path = parsed.pathname;
    } else {
      result.database = parsed.pathname.substring(1);
    }

    // A number alone in the path is the Redis database index; anything else
    // there left the database empty rather than a partially numeric name.
    if (kind === "redis" && /^\d+$/.test(parsed.pathname.slice(1))) {
      result.database = parsed.pathname.slice(1);
    }
  } catch {
    // A malformed paste fills nothing rather than flagging an error; the
    // user sees the empty fields and fixes the string.
  }

  return result;
}
