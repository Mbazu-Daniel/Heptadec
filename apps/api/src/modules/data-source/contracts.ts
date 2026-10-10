import type { IResultGrid } from "../query/contracts";

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

export type QueryLanguage = "sql" | "command";

export interface IEngineSpec {
  readonly name: string;
  readonly defaultPort: number | null;
  readonly fields: readonly IConnectionField[];
  readonly acceptsConnectionUrl: boolean;
  readonly schemes: readonly string[];
  readonly queryLanguage: QueryLanguage | null;
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
    queryLanguage: null,
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
    queryLanguage: null,
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
    queryLanguage: null,
  },
  redis: {
    name: "Redis",
    defaultPort: 6379,
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
  },
  quickwit: {
    name: "Quickwit",
    defaultPort: null,
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
    queryLanguage: null,
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
    queryLanguage: null,
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
    queryLanguage: null,
  },
} as const satisfies Record<string, IEngineSpec>;

export type DataSourceKind = keyof typeof ENGINE_SPECS;

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

export type PreviewObjectType = "table" | "key" | "index";

export interface IPreviewObject {
  name: string;
  type: PreviewObjectType;
}

export interface IObjectsResponse {
  objects: IPreviewObject[];
}

export type IPreviewResponse = IResultGrid;

export interface ITestConnectionResponse {
  ok: boolean;
  total: number;
  sample: string[];
}
