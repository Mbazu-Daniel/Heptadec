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
// A password or token is pasted, not typed, so its whitespace is content.
const KEEP_VERBATIM: readonly ConnectionFieldKind[] = ["password", "token"];

export const PORT_MESSAGE = `The port must be a whole number between ${PORT_MIN} and ${PORT_MAX}`;

/**
 * The form's state as the body both create and update accept. A field left
 * blank is left out rather than sent empty, which on create means no value and
 * on update means keep the one already stored.
 *
 * A pasted connection URL is sent whole and parsed on the server, which also
 * decides the mode there; the fields it filled in are its preview, not extra
 * input. When no URL was pasted, the typed fields are what gets sent.
 *
 * Returns null when the port is not a whole number in range.
 */
export function connectionPayload(input: {
  kind: DataSourceKind;
  mode: ConnectionMode | null;
  connectionUrl?: string;
  name: string;
  readOnly: boolean;
  values: Readonly<Record<string, string>>;
}): ICreateDataSourceRequest | null {
  const { kind, mode, connectionUrl, name, readOnly, values } = input;
  const url = connectionUrl?.trim() ?? "";
  // The test endpoint accepts an unnamed source, so a blank name falls back
  // to a throwaway label there; create always has a name from its guard.
  const displayName = name.trim() === "" ? "connection test" : name.trim();

  if (url !== "") {
    return {
      kind,
      name: displayName,
      readOnly,
      connectionUrl: url,
    };
  }

  const body: ICreateDataSourceRequest = {
    kind,
    name: displayName,
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
