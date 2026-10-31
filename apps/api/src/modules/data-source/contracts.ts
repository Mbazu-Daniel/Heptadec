import type { StructureState } from "@heptadec/db/structure-state";
import type { IResultGrid } from "../query/contracts";

export type { StructureState };

export type ConnectionMode = "tcp" | "tls" | "socket";

export type ConnectionFieldKind =
  | "connectionMode"
  | "host"
  | "port"
  | "socketPath"
  | "database"
  | "filePath"
  | "username"
  | "password"
  | "schema"
  | "options"
  | "caCert"
  | "clientCert"
  | "clientKey"
  | "token"
  | "endpoint";

export interface IConnectionField {
  kind: ConnectionFieldKind;
  label: string;
  required: boolean;
  placeholder?: string;
  modes?: readonly ConnectionMode[];
}

export type QueryLanguage = "sql" | "command" | "pipeline" | "search";

export const LANGUAGES = {
  sql: { savable: true },
  command: { savable: false },
  pipeline: { savable: false },
  search: { savable: false },
} as const satisfies Record<QueryLanguage, { readonly savable: boolean }>;

export type SqlDialect = "postgres" | "mysql" | "clickhouse" | "sqlite";

export interface IEngineSpec {
  readonly name: string;
  readonly defaultPort: number | null;
  readonly fields: readonly IConnectionField[];
  readonly acceptsConnectionUrl: boolean;
  readonly schemes: readonly string[];
  preview?: boolean;
  readonly carriesUrlQuery?: boolean;
  readonly queryLanguage: QueryLanguage | null;
  readonly sqlDialect: SqlDialect | null;
  readonly supportsExplain: boolean;
  readonly supportsTooling: boolean;
}

const SERVER: {
  readonly connectionMode: IConnectionField;
  readonly host: (
    label: string,
    modes: readonly ConnectionMode[],
  ) => IConnectionField;
  readonly port: IConnectionField;
  readonly socketPath: IConnectionField;
  readonly username: IConnectionField;
  readonly password: IConnectionField;
} = {
  connectionMode: {
    kind: "connectionMode",
    label: "Connection mode",
    required: true,
  },
  host: (label, modes) => ({
    kind: "host",
    label,
    required: true,
    placeholder: "db.internal",
    modes,
  }),
  port: {
    kind: "port",
    label: "Port",
    required: true,
    modes: ["tcp", "tls"],
  },
  socketPath: {
    kind: "socketPath",
    label: "Socket path",
    required: true,
    placeholder: "/var/run/postgresql/.s.PGSQL.5432",
    modes: ["socket"],
  },
  username: {
    kind: "username",
    label: "Username",
    required: true,
    placeholder: "readonly_svc",
  },
  password: {
    kind: "password",
    label: "Password",
    required: false,
  },
};

const TLS = [
  {
    kind: "caCert",
    label: "CA certificate",
    required: false,
    placeholder: "-----BEGIN CERTIFICATE-----",
    modes: ["tls"],
  },
  {
    kind: "clientCert",
    label: "Client certificate",
    required: false,
    placeholder: "-----BEGIN CERTIFICATE-----",
    modes: ["tls"],
  },
  {
    kind: "clientKey",
    label: "Client key",
    required: false,
    placeholder: "-----BEGIN PRIVATE KEY-----",
    modes: ["tls"],
  },
] as const satisfies readonly IConnectionField[];

const TCP_AND_TLS = ["tcp", "tls"] as const;

export type DataSourceKind =
  | "postgres"
  | "mysql"
  | "mariadb"
  | "clickhouse"
  | "redis"
  | "quickwit"
  | "libsql"
  | "sqlite"
  | "mongodb";

export const ENGINE_SPECS = {
  postgres: {
    name: "Postgres",
    defaultPort: 5432,
    fields: [
      SERVER.connectionMode,
      SERVER.host("Host", TCP_AND_TLS),
      SERVER.port,
      {
        kind: "database",
        label: "Database",
        required: true,
        placeholder: "warehouse",
      },
      SERVER.username,
      SERVER.password,
      SERVER.socketPath,
      {
        kind: "schema",
        label: "Schema",
        required: false,
        placeholder: "public",
      },
      {
        kind: "options",
        label: "Options",
        required: false,
        placeholder: "-c statement_timeout=5000",
      },
      ...TLS,
    ],
    acceptsConnectionUrl: true,
    schemes: ["postgres:", "postgresql:"],
    queryLanguage: "sql",
    sqlDialect: "postgres",
    supportsExplain: true,
    supportsTooling: true,
  },
  mysql: {
    name: "MySQL",
    defaultPort: 3306,
    fields: [
      SERVER.connectionMode,
      SERVER.host("Host", TCP_AND_TLS),
      SERVER.port,
      {
        kind: "database",
        label: "Database",
        required: true,
        placeholder: "warehouse",
      },
      SERVER.username,
      SERVER.password,
      SERVER.socketPath,
      {
        kind: "options",
        label: "Options",
        required: false,
        placeholder: "--ssl-mode=VERIFY_IDENTITY",
      },
      ...TLS,
    ],
    acceptsConnectionUrl: true,
    schemes: ["mysql:"],
    queryLanguage: "sql",
    sqlDialect: "mysql",
    supportsExplain: false,
    supportsTooling: false,
  },
  mariadb: {
    name: "MariaDB",
    defaultPort: 3306,
    fields: [
      SERVER.connectionMode,
      SERVER.host("Host", TCP_AND_TLS),
      SERVER.port,
      {
        kind: "database",
        label: "Database",
        required: true,
        placeholder: "warehouse",
      },
      SERVER.username,
      SERVER.password,
      SERVER.socketPath,
      {
        kind: "options",
        label: "Options",
        required: false,
      },
      ...TLS,
    ],
    acceptsConnectionUrl: true,
    schemes: ["mysql:"],
    queryLanguage: "sql",
    sqlDialect: "mysql",
    supportsExplain: false,
    supportsTooling: false,
  },
  clickhouse: {
    name: "ClickHouse",
    defaultPort: 8123,
    fields: [
      SERVER.connectionMode,
      SERVER.host("Host", TCP_AND_TLS),
      SERVER.port,
      {
        kind: "database",
        label: "Database",
        required: false,
        placeholder: "default",
      },
      { kind: "username", label: "Username", required: false, placeholder: "default" },
      { kind: "password", label: "Password", required: false },
      {
        kind: "options",
        label: "Options",
        required: false,
        placeholder: "max_execution_time=30",
      },
      {
        kind: "caCert",
        label: "CA certificate",
        required: true,
        placeholder: "-----BEGIN CERTIFICATE-----",
        modes: ["tls"],
      },
      ...TLS.filter((field) => field.kind !== "caCert"),
    ],
    acceptsConnectionUrl: true,
    schemes: ["http:", "https:"],
    queryLanguage: "sql",
    sqlDialect: "clickhouse",
    supportsExplain: false,
    supportsTooling: false,
  },
  redis: {
    name: "Redis",
    defaultPort: 6379,
    preview: true,
    fields: [
      SERVER.host("Host", TCP_AND_TLS),
      SERVER.port,
      {
        kind: "database",
        label: "Database index",
        required: false,
        placeholder: "0",
      },
      { kind: "username", label: "Username", required: false, placeholder: "default" },
      { kind: "password", label: "Password", required: false },
    ],
    acceptsConnectionUrl: true,
    schemes: ["redis:", "rediss:"],
    queryLanguage: "command",
    sqlDialect: null,
    supportsExplain: false,
    supportsTooling: false,
  },
  quickwit: {
    name: "Quickwit",
    defaultPort: null,
    preview: true,
    fields: [
      {
        kind: "endpoint",
        label: "Endpoint URL",
        required: true,
        placeholder: "https://search.internal:7280",
      },
      {
        kind: "database",
        label: "Index",
        required: false,
        placeholder: "events",
      },
      { kind: "token", label: "Token", required: false },
    ],
    acceptsConnectionUrl: false,
    schemes: ["http:", "https:"],
    queryLanguage: "search",
    sqlDialect: null,
    supportsExplain: false,
    supportsTooling: false,
  },
  libsql: {
    name: "LibSQL",
    defaultPort: null,
    fields: [
      {
        kind: "endpoint",
        label: "Database URL",
        required: true,
        placeholder: "https://turso.example",
      },
      { kind: "token", label: "Auth token", required: false },
    ],
    acceptsConnectionUrl: false,
    schemes: ["http:", "https:", "libsql:", "ws:", "wss:"],
    queryLanguage: "sql",
    sqlDialect: "sqlite",
    supportsExplain: false,
    supportsTooling: false,
  },
  sqlite: {
    name: "SQLite",
    defaultPort: null,
    fields: [
      {
        kind: "filePath",
        label: "File path",
        required: true,
        placeholder: "/data/analytics.db",
      },
    ],
    acceptsConnectionUrl: false,
    schemes: [],
    queryLanguage: "sql",
    sqlDialect: "sqlite",
    supportsExplain: false,
    supportsTooling: false,
  },
  mongodb: {
    name: "MongoDB",
    defaultPort: 27017,
    fields: [
      SERVER.host("Host", TCP_AND_TLS),
      SERVER.port,
      {
        kind: "database",
        label: "Database",
        required: true,
        placeholder: "telemetry",
      },
      SERVER.username,
      SERVER.password,
      {
        kind: "options",
        label: "Connection options",
        required: false,
        placeholder: "authSource=admin&replicaSet=rs0",
      },
    ],
    acceptsConnectionUrl: true,
    schemes: ["mongodb:"],
    carriesUrlQuery: true,
    queryLanguage: "pipeline",
    sqlDialect: null,
    supportsExplain: false,
    supportsTooling: false,
  },
  } as const satisfies Record<DataSourceKind, IEngineSpec>;

export function isDataSourceKind(value: string): value is DataSourceKind {
  return Object.hasOwn(ENGINE_SPECS, value);
}

export function kindFromConnectionUrl(url: string): DataSourceKind | null {
  const scheme = url
    .trim()
    .match(/^[A-Za-z][A-Za-z0-9+.-]*:/)?.[0]
    ?.toLowerCase();
  if (scheme === undefined) {
    return null;
  }
  for (const kind of Object.keys(ENGINE_SPECS)) {
    if (!isDataSourceKind(kind)) {
      continue;
    }
    const spec: IEngineSpec = ENGINE_SPECS[kind];
    if (!spec.acceptsConnectionUrl || !spec.schemes.includes(scheme)) {
      continue;
    }
    if (kind === "clickhouse") {
      let port: number;
      try {
        port = Number(new URL(url.trim()).port);
      } catch {
        return null;
      }
      if (port !== spec.defaultPort) {
        return null;
      }
    }
    return kind;
  }
  return null;
}

export function defaultConnectionMode(
  kind: DataSourceKind,
): ConnectionMode | null {
  const fields: readonly IConnectionField[] = ENGINE_SPECS[kind].fields;
  const modes = fields.flatMap((field) => field.modes ?? []);
  return modes.length === 0 ? null : "tcp";
}

export function connectionFields(
  kind: DataSourceKind,
  mode: ConnectionMode | null,
): readonly IConnectionField[] {
  const fields: readonly IConnectionField[] = ENGINE_SPECS[kind].fields;
  return fields.filter(
    (field) =>
      field.modes === undefined ||
      (mode !== null && field.modes.includes(mode)),
  );
}

export function isPreviewEngine(kind: DataSourceKind): boolean {
  const spec: IEngineSpec = ENGINE_SPECS[kind];
  return spec.preview === true;
}

export const PORT_MIN = 1;

export const PORT_MAX = 65535;

export interface ICreateDataSourceRequest {
  kind: DataSourceKind;
  name: string;
  readOnly?: boolean;
  connectionUrl?: string;
  connectionMode?: ConnectionMode;
  host?: string;
  port?: number;
  socketPath?: string;
  database?: string;
  filePath?: string;
  endpoint?: string;
  username?: string;
  password?: string;
  schema?: string;
  options?: string;
  caCert?: string;
  clientCert?: string;
  clientKey?: string;
  token?: string;
}

export type IUpdateDataSourceRequest = Omit<ICreateDataSourceRequest, "kind">;

export interface IUpdateDataSourceResponse {
  dataSource: IDataSource;
}

export interface IDataSource {
  id: string;
  organizationId: string;
  kind: DataSourceKind;
  name: string;
  host: string | null;
  port: number | null;
  socketPath: string | null;
  connectionMode: ConnectionMode | null;
  database: string | null;
  schemaName: string | null;
  options: string | null;
  username: string | null;
  hasSecret: boolean;
  hasCaCert: boolean;
  hasClientCert: boolean;
  hasClientKey: boolean;
  hasToken: boolean;
  readOnly: boolean;
  queryLanguage: QueryLanguage | null;
  sqlDialect: SqlDialect | null;
  canExplain: boolean;
  tooling: boolean;
  structure: IStructureSummary | null;
  createdAt: string;
  updatedAt: string;
}

export interface IDataSourceListResponse {
  dataSources: IDataSource[];
}

export interface ICreateDataSourceResponse {
  dataSource: IDataSource;
}

export interface IDeleteDataSourceResponse {
  removed: string;
}

export type PreviewObjectType = "table" | "collection" | "key" | "index";

export interface IPreviewObject {
  name: string;
  type: PreviewObjectType;
}

/**
 * Where a source's structure stands with the app: the state of its last sync and
 * the age of what that sync stored. A source whose engine keeps no structure —
 * a key space, an index list — has none of this, and `IDataSource.structure` is
 * null for it.
 */
export interface IStructureSummary {
  state: StructureState;
  /** Whether a sync of this source is running or queued right now. */
  syncing: boolean;
  stale: boolean;
  syncedAt: string | null;
}

export type IPreviewResponse = IResultGrid;

export interface ITestConnectionResponse {
  ok: boolean;
  total: number;
  sample: string[];
}
