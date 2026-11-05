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
const KEEP_VERBATIM: readonly ConnectionFieldKind[] = ["password", "token"];

export const PORT_MESSAGE = `The port must be a whole number between ${PORT_MIN} and ${PORT_MAX}`;

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
