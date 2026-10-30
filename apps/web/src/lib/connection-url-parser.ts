import type {
  ConnectionFieldKind,
  DataSourceKind,
} from "@heptadec/api/data-source-contracts";

export function parseConnectionUrl(
  url: string,
  kind: DataSourceKind,
): Partial<Record<ConnectionFieldKind, string>> {
  const result: Partial<Record<ConnectionFieldKind, string>> = {};

  try {
    if (kind === "sqlite" && !url.includes("://")) {
      result.filePath = url;
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
      result.filePath = parsed.pathname;
    } else {
      result.database = parsed.pathname.substring(1);
    }

    if (kind === "redis" && /^\d+$/.test(parsed.pathname.slice(1))) {
      result.database = parsed.pathname.slice(1);
    }
  } catch {
  }

  return result;
}
