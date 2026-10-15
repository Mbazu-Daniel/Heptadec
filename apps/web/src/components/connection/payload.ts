import type {
  ConnectionFieldKind,
  ConnectionMode,
  DataSourceKind,
  ICreateDataSourceRequest,
} from "@heptadec/api/data-source-contracts";
import {
  PORT_MAX,
  PORT_MIN,
  connectionFields,
} from "@heptadec/api/data-source-contracts";
import type { ConnectionMethod } from "./ConnectionMethod";

// A password or token is pasted, not typed, so its whitespace is content.
const KEEP_VERBATIM: readonly ConnectionFieldKind[] = ["password", "token"];

/**
 * The form's state as the body both create and update accept. A field left
 * blank is left out rather than sent empty, which on create means no value and
 * on update means keep the one already stored.
 *
 * Returns null when the port is not a whole number in range.
 */
export function connectionPayload(input: {
  kind: DataSourceKind;
  mode: ConnectionMode | null;
  method?: ConnectionMethod;
  connectionUrl?: string;
  name: string;
  readOnly: boolean;
  values: Readonly<Record<string, string>>;
}): ICreateDataSourceRequest | null {
  const { kind, mode, method, connectionUrl, name, readOnly, values } = input;

  // A source pasted in whole is parsed from the URL, which says which mode to
  // use, so the fields the mode would have filled in are not sent again.
  if (method === "url") {
    return {
      kind,
      name: name.trim().length === 0 ? "connection test" : name.trim(),
      readOnly,
      connectionUrl: (connectionUrl ?? "").trim(),
    };
  }

  const body: ICreateDataSourceRequest = {
    kind,
    name: name.trim().length === 0 ? "connection test" : name.trim(),
    readOnly,
    ...(mode === null ? {} : { connectionMode: mode }),
  };

  type ITextField = Exclude<ConnectionFieldKind, "port" | "connectionMode">;
  const connection: Partial<Record<ITextField, string>> = {};
  for (const field of connectionFields(kind, mode)) {
    if (field.kind === "port" || field.kind === "connectionMode") {
      continue;
    }
    const raw = values[field.kind] ?? "";
    const value = KEEP_VERBATIM.includes(field.kind) ? raw : raw.trim();
    if (value.length > 0) {
      connection[field.kind] = value;
    }
  }

  const port = (values.port ?? "").trim();
  if (port.length > 0) {
    const parsed = Number(port);
    if (!Number.isInteger(parsed) || parsed < PORT_MIN || parsed > PORT_MAX) {
      return null;
    }
    body.port = parsed;
  }

  return { ...body, ...connection };
}
