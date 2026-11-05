import type { DataSourceKind } from "@heptadec/api/data-source-contracts";

export function parseConnectionUrl(
  url: string,
  kind: DataSourceKind,
): Record<string, string> {
  const result: Record<string, string> = {};

  try {
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

    if (kind === "redis" && /^\d+$/.test(parsed.pathname.slice(1))) {
      result.database = parsed.pathname.slice(1);
    }
  } catch {
    // A malformed paste fills nothing rather than flagging an error; the
    // user sees the empty fields and fixes the string.
  }

  return result;
}
