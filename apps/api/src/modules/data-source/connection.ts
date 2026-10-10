import { BadRequestException } from "../../common/exceptions";
import type { DataSourceRow } from "@heptadec/db";
import { readString } from "../../common/http/body";
import { decryptSecret } from "./secret";
import {
  ENGINE_SPECS,
  PORT_MAX,
  PORT_MIN,
  type ConnectionFieldKind,
  type ConnectionMode,
  type DataSourceKind,
  type IConnectionField,
  type IEngineSpec,
} from "./contracts";

const MAX_NAME = 80;

const MAX_HOST = 255;

const MAX_DATABASE = 128;

const MAX_USERNAME = 128;

const MAX_PASSWORD = 512;

const MAX_PATH = 512;

const MAX_SCHEMA = 64;

const MAX_OPTIONS = 512;

const MAX_CERT = 4096;

const LENGTHS: Partial<Record<ConnectionFieldKind, number>> = {
  host: MAX_HOST,
  socketPath: MAX_PATH,
  database: MAX_DATABASE,
  filePath: MAX_PATH,
  username: MAX_USERNAME,
  password: MAX_PASSWORD,
  schema: MAX_SCHEMA,
  options: MAX_OPTIONS,
  caCert: MAX_CERT,
  clientCert: MAX_CERT,
  clientKey: MAX_CERT,
  token: MAX_CERT,
};

const KNOWN_FIELDS: readonly ConnectionFieldKind[] = [
  "host",
  "port",
  "socketPath",
  "database",
  "filePath",
  "username",
  "password",
  "schema",
  "options",
  "caCert",
  "clientCert",
  "clientKey",
  "token",
  "endpoint",
];

export interface IConnectionInput {
  kind: DataSourceKind;
  name: string;
  readOnly: boolean;
  connectionMode: ConnectionMode | null;
  host: string | null;
  port: number | null;
  socketPath: string | null;
  database: string | null;
  schemaName: string | null;
  options: string | null;
  username: string | null;
  password: string | null;
  caCert: string | null;
  clientCert: string | null;
  clientKey: string | null;
  token: string | null;
}

function readReadOnly(body: Record<string, unknown>): boolean {
  const value = body.readOnly;
  if (value === undefined) {
    return false;
  }
  if (typeof value !== "boolean") {
    throw new BadRequestException("Read-only must be true or false");
  }
  return value;
}

function readMode(body: Record<string, unknown>): ConnectionMode | null {
  const value = body.connectionMode;
  if (value === undefined || value === null) {
    return null;
  }
  if (value !== "tcp" && value !== "tls" && value !== "socket") {
    throw new BadRequestException(
      "The connection mode must be tcp, tls or socket",
    );
  }
  return value;
}

const carriedByUrl: Partial<
  Record<ConnectionFieldKind, keyof IFromUrl>
> = {
  host: "host",
  port: "port",
  database: "database",
  username: "username",
  password: "password",
};

function rejectField(
  body: Record<string, unknown>,
  field: ConnectionFieldKind,
  kind: DataSourceKind,
): void {
  const value = body[field];
  if (value !== undefined && value !== null && value !== "") {
    throw new BadRequestException(
      `${ENGINE_SPECS[kind].name} has no ${field} setting here`,
    );
  }
}

function rejectForeign(
  body: Record<string, unknown>,
  inMode: ReadonlySet<ConnectionFieldKind>,
  kind: DataSourceKind,
): void {
  for (const field of KNOWN_FIELDS) {
    if (inMode.has(field)) {
      continue;
    }
    rejectField(body, field, kind);
  }
}

interface IFromUrl {
  connectionMode: ConnectionMode;
  host: string;
  port: number | null;
  database: string | null;
  username: string | null;
  password: string | null;
}

function fromUrl(raw: unknown, kind: DataSourceKind): IFromUrl {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    throw new BadRequestException("A connection URL is required");
  }
  const spec: IEngineSpec = ENGINE_SPECS[kind];
  if (!spec.acceptsConnectionUrl) {
    throw new BadRequestException(
      `${spec.name} cannot be connected with a URL`,
    );
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new BadRequestException("That is not a connection URL");
  }
  if (!spec.schemes.includes(url.protocol)) {
    throw new BadRequestException(
      `A ${spec.name} connection URL starts with ${spec.schemes.join(" or ")}`,
    );
  }
  if (url.hostname.length === 0) {
    throw new BadRequestException("That connection URL has no host");
  }

  let port: number | null = null;
  if (url.port.length > 0) {
    const parsed = Number(url.port);
    if (!Number.isInteger(parsed) || parsed < PORT_MIN || parsed > PORT_MAX) {
      throw new BadRequestException("That connection URL has an invalid port");
    }
    port = parsed;
  }

  const database = decode(url.pathname.replace(/^\//, ""));
  return {
    connectionMode:
      url.protocol === "https:" || url.protocol === "rediss:"
        ? "tls"
        : "tcp",
    host: decode(url.hostname),
    port: port ?? spec.defaultPort,
    database: database.length === 0 ? null : database,
    username: url.username.length === 0 ? null : decode(url.username),
    password: url.password.length === 0 ? null : decode(url.password),
  };
}

function decode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    throw new BadRequestException("That connection URL has invalid escaping");
  }
}

export function readConnection(
  body: Record<string, unknown>,
): IConnectionInput {
  const kind = readKind(body);
  const name = readString(body, "name", "A name is required").trim();
  if (name.length === 0) {
    throw new BadRequestException("A name is required");
  }
  if (name.length > MAX_NAME) {
    throw new BadRequestException("The name is too long");
  }

  const spec: IEngineSpec = ENGINE_SPECS[kind];
  const pasted = body.connectionUrl;
  const fromUrl_ =
    pasted === undefined || pasted === null || pasted === ""
      ? null
      : fromUrl(pasted, kind);
  if (fromUrl_ !== null) {
    for (const field of spec.fields) {
      if (field.modes === undefined) {
        rejectField(body, field.kind, kind);
      }
    }
  }
  const connectionMode =
    fromUrl_?.connectionMode ?? readMode(body) ?? defaultMode(spec.fields);
  const active = visibleFields(spec.fields, connectionMode);
  if (fromUrl_ === null) {
    rejectForeign(body, new Set(active.map((field) => field.kind)), kind);
  }

  const values: Partial<Record<ConnectionFieldKind, string | number | null>> =
    {};

  for (const field of active) {
    if (field.kind === "connectionMode") {
      continue;
    }
    values[field.kind] = readField(body, field, kind, fromUrl_);
  }

  return {
    kind,
    name,
    readOnly: readReadOnly(body),
    connectionMode,
    host: text(values.host ?? values.endpoint),
    port: typeof values.port === "number" ? values.port : null,
    socketPath: text(values.socketPath),
    database: text(values.database ?? values.filePath),
    schemaName: text(values.schema),
    options: text(values.options),
    username: text(values.username),
    password: text(values.password),
    caCert: text(values.caCert),
    clientCert: text(values.clientCert),
    clientKey: text(values.clientKey),
    token: text(values.token),
  };
}

function defaultMode(fields: readonly IConnectionField[]): ConnectionMode | null {
  const modes = fields.flatMap((field) => field.modes ?? []);
  return modes.length === 0 ? null : "tcp";
}

function visibleFields(
  fields: readonly IConnectionField[],
  mode: ConnectionMode | null,
): readonly IConnectionField[] {
  if (mode === null) {
    return fields.filter((field) => field.modes === undefined);
  }
  return fields.filter(
    (field) => field.modes === undefined || field.modes.includes(mode),
  );
}

function readField(
  body: Record<string, unknown>,
  field: IConnectionField,
  kind: DataSourceKind,
  pasted: IFromUrl | null,
): string | number | null {
  if (field.kind === "connectionMode") {
    return connectionModeText(body.connectionMode);
  }
  const fromUrlField = carriedByUrl[field.kind];
  const carried =
    pasted === null || fromUrlField === undefined
      ? undefined
      : pasted[fromUrlField];
  if (carried !== undefined && carried !== null) {
    return carried;
  }

  const raw = body[field.kind];
  const missing = raw === undefined || raw === null || raw === "";

  if (field.kind === "port") {
    if (missing) {
      return ENGINE_SPECS[kind].defaultPort;
    }
    return readPort(raw);
  }
  if (missing) {
    if (field.required) {
      throw new BadRequestException(`${field.label} is required`);
    }
    return null;
  }
  if (typeof raw !== "string") {
    throw new BadRequestException(`${field.label} must be text`);
  }
  if (field.kind === "endpoint" && !/^https?:\/\//.test(raw)) {
    throw new BadRequestException(`${field.label} must be an http(s) URL`);
  }
  const limit = LENGTHS[field.kind];
  if (limit !== undefined && raw.length > limit) {
    throw new BadRequestException(`${field.label} is too long`);
  }
  return raw;
}

function connectionModeText(raw: unknown): ConnectionMode {
  if (raw === undefined || raw === null || raw === "") {
    return "tcp";
  }
  if (raw !== "tcp" && raw !== "tls" && raw !== "socket") {
    throw new BadRequestException(
      "The connection mode must be tcp, tls or socket",
    );
  }
  return raw;
}

function readPort(raw: unknown): number {
  if (
    typeof raw !== "number" ||
    !Number.isInteger(raw) ||
    raw < PORT_MIN ||
    raw > PORT_MAX
  ) {
    throw new BadRequestException(
      `The port must be between ${PORT_MIN} and ${PORT_MAX}`,
    );
  }
  return raw;
}

function text(value: string | number | null | undefined): string | null {
  return value === null || value === undefined || value === "" ? null : `${value}`;
}

function readKind(body: Record<string, unknown>): DataSourceKind {
  const kind = readString(
    body,
    "kind",
    "Pick a supported database engine",
  );
  if (!Object.hasOwn(ENGINE_SPECS, kind)) {
    throw new BadRequestException("Pick a supported database engine");
  }
  return kind as DataSourceKind;
}

function storedMode(value: string | null): ConnectionMode | null {
  if (value === null || value === "") {
    return null;
  }
  if (value === "tcp" || value === "tls" || value === "socket") {
    return value;
  }
  throw new BadRequestException("That source's connection mode is not recognised");
}

export interface IStoredConnection {
  kind: DataSourceKind;
  connectionMode: ConnectionMode | null;
  host: string | null;
  port: number | null;
  socketPath: string | null;
  database: string | null;
  schemaName: string | null;
  options: string | null;
  username: string | null;
  password: string | null;
  caCert: string | null;
  clientCert: string | null;
  clientKey: string | null;
  token: string | null;
}

export function storedFromRow(row: DataSourceRow): IStoredConnection {
  return {
    kind: row.kind as DataSourceKind,
    connectionMode: storedMode(row.connectionMode),
    host: row.host,
    port: row.port,
    socketPath: row.socketPath,
    database: row.database,
    schemaName: row.schemaName,
    options: row.options,
    username: row.username,
    password: unseal(row.secret),
    caCert: unseal(row.caCertificate),
    clientCert: unseal(row.clientCertificate),
    clientKey: unseal(row.clientKey),
    token: unseal(row.token),
  };
}

export function storedFromInput(input: IConnectionInput): IStoredConnection {
  return {
    kind: input.kind,
    connectionMode: input.connectionMode,
    host: input.host,
    port: input.port,
    socketPath: input.socketPath,
    database: input.database,
    schemaName: input.schemaName,
    options: input.options,
    username: input.username,
    password: input.password,
    caCert: input.caCert,
    clientCert: input.clientCert,
    clientKey: input.clientKey,
    token: input.token,
  };
}

function unseal(envelope: string | null): string | null {
  return envelope === null ? null : decryptSecret(envelope);
}

export function tcpAddress(connection: IStoredConnection): {
  host: string;
  port: number;
} {
  if (connection.host === null || connection.port === null) {
    throw new BadRequestException("That source is missing connection details");
  }
  return { host: connection.host, port: connection.port };
}

export function endpointAddress(connection: IStoredConnection): {
  url: string;
  token: string | null;
} {
  if (connection.host === null) {
    throw new BadRequestException("That source is missing connection details");
  }
  return { url: connection.host, token: connection.token };
}

export function databaseName(connection: IStoredConnection): string {
  if (connection.database === null) {
    throw new BadRequestException("That source is missing connection details");
  }
  return connection.database;
}

export interface ISavedConnection {
  connectionMode: ConnectionMode | null;
  host: string;
  port: number;
  socketPath: string | null;
  database: string;
  username: string;
  password: string | null;
  schemaName: string | null;
  options: string | null;
  caCert: string | null;
  clientCert: string | null;
  clientKey: string | null;
  readOnly: boolean;
}

export function savedConnection(row: DataSourceRow): ISavedConnection {
  return asRelational(storedFromRow(row), row.readOnly);
}

export function asRelational(
  stored: IStoredConnection,
  readOnly: boolean,
): ISavedConnection {
  const viaSocket = stored.connectionMode === "socket";

  if (stored.database === null) {
    throw new BadRequestException("That source is missing connection details");
  }
  if (!viaSocket && (stored.host === null || stored.port === null)) {
    throw new BadRequestException("That source is missing connection details");
  }
  if (!viaSocket && stored.username === null) {
    throw new BadRequestException("That source is missing connection details");
  }

  return {
    connectionMode: stored.connectionMode,
    host: stored.host ?? "",
    port: stored.port ?? 0,
    socketPath: stored.socketPath,
    database: stored.database,
    username: stored.username ?? "",
    password: stored.password,
    schemaName: stored.schemaName,
    options: stored.options,
    caCert: stored.caCert,
    clientCert: stored.clientCert,
    clientKey: stored.clientKey,
    readOnly,
  };
}
