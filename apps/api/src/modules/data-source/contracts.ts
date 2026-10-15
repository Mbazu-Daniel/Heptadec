import type { IResultGrid } from "../query/contracts";
import { BadRequestException } from "../../common/exceptions";

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

// A pipeline source is MongoDB: it has collections and documents rather than
// tables and columns, and it is asked for an aggregation pipeline, not SQL.
// A search source is Quickwit: it holds indexes of documents and answers a query
// string rather than a statement.
export type QueryLanguage = "sql" | "command" | "pipeline" | "search";

/**
 * What the app knows about speaking one language.
 *
 * A language, not an engine, is what a request, a Saved Query and a Schedule
 * actually carry, so the questions callers kept re-asking of the catalog are
 * answered here once, per language, and an engine inherits them by naming one.
 *
 * `savable` is whether a Saved Query can hold a statement of this language. A
 * Schedule is a saved query on a timer and an Alert Rule is a threshold over a
 * saved query's result, so this one fact settles all three; it belongs to the
 * language because the row that carries it holds SQL text whatever the source
 * underneath speaks. Keyed by the union, so a language added later is refused
 * here until someone says which side of that line it falls on.
 */
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
  /** Whether this engine is a preview feature: still fully queryable, but
   * shown as experimental in the UI rather than a first-class provider.
   */
  preview?: boolean;
  /** Whether a pasted connection URL's query string is kept as the source's
   * options instead of being dropped. Only engines that carry their settings
   * that way set it.
   */
  readonly carriesUrlQuery?: boolean;
  readonly queryLanguage: QueryLanguage | null;
  readonly sqlDialect: SqlDialect | null;
  readonly supportsExplain: boolean;
  /**
   * Whether the app's own tooling is implemented for this engine: reading its
   * structure as tables and typed fields, running EXPLAIN against it, and
   * previewing rows through the app rather than the driver.
   *
   * Everything built on top of that reads this one entry — dashboards are
   * charts over the columns it describes, and the MCP tools expose the same
   * three operations to an external agent — so which engines those features
   * cover is said once rather than a comparison of the engine's name repeated
   * in each of them. Postgres and nothing else today, because the readers are
   * Postgres ones; a new engine flips this when its own exist.
   */
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

/**
 * Every engine the catalog may hold, named before the catalog is written.
 *
 * The union is written here rather than derived from `ENGINE_SPECS` so that the
 * catalog can be checked against it: with the union as the key type, an engine
 * that is declared in the type but missing from the map — or added to the map
 * but missing from the union — stops compiling instead of quietly working.
 */
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

/**
 * The only place a stored `kind` becomes a typed engine.
 *
 * The column is text with no constraint — `packages/db` is schema-only and
 * must not learn the engine catalog — so every reader used to cast the row
 * itself (`row.kind as DataSourceKind`), making each one a private assertion
 * that the database was telling the truth. An engine the catalog has never
 * heard of is now an error here, once, instead of a lie at every use site.
 */
export function engineFrom(kind: string): IEngineSpec {
  const spec: IEngineSpec | undefined = ENGINE_SPECS[kind as DataSourceKind];
  if (spec === undefined) {
    throw new BadRequestException(`Unknown data source kind: ${kind}`);
  }
  return spec;
}

/** The engine a stored row is. */
export function engineOf(row: { kind: string }): IEngineSpec {
  return engineFrom(row.kind);
}

/**
 * The kind a stored row is, as a name rather than a spec. The cast is safe
 * because `engineFrom` has already proven the catalog knows this string.
 */
export function kindOf(row: { kind: string }): DataSourceKind {
  engineFrom(row.kind);
  return row.kind as DataSourceKind;
}

/**
 * The mode a source connects with when the body does not name one. An engine
 * with no mode-dependent fields has no mode at all.
 */
export function defaultConnectionMode(
  kind: DataSourceKind,
): ConnectionMode | null {
  const fields: readonly IConnectionField[] = ENGINE_SPECS[kind].fields;
  const modes = fields.flatMap((field) => field.modes ?? []);
  return modes.length === 0 ? null : "tcp";
}

/**
 * The fields a connection mode makes reachable. A socket has no host and a TLS
 * connection is the only one that carries certificates, so the rest are not
 * just hidden but refused.
 */
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

/**
 * Whether an engine is still a preview feature. Read through a helper because
 * only some engines carry the flag, so the spec union cannot be indexed for it
 * directly.
 */
export function isPreviewEngine(kind: DataSourceKind): boolean {
  const spec: IEngineSpec = ENGINE_SPECS[kind];
  return spec.preview === true;
}

/**
 * Whether a source can be put to the AI. A source is asked in a language it
 * names, and a language that exists is one the app can read back; one that does
 * not — an engine with no query language of its own — cannot be asked at all.
 *
 * Takes the row rather than a kind so that a caller never has to cast a stored
 * string on the way to asking a question about it.
 */
export function canBeAsked(row: { kind: string }): boolean {
  return engineOf(row).queryLanguage !== null;
}

/**
 * Whether a source's statements can be kept as a Saved Query, and therefore
 * whether one of them can be put on a Schedule or watched by an Alert Rule.
 */
export function canBeSaved(row: { kind: string }): boolean {
  const language = engineOf(row).queryLanguage;
  return language !== null && LANGUAGES[language].savable;
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

/**
 * A restatement of the whole source, exactly as it was sent when it was created
 * but without an engine: a source that points somewhere else is a different
 * source, so the engine stays the one already stored.
 *
 * A secret is the one exception. The client is never shown a stored password,
 * certificate, key, or token, only that one exists, so leaving it out of this
 * body keeps the value already on the source rather than clearing it.
 */
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

export interface IObjectsResponse {
  objects: IPreviewObject[];
}

export type IPreviewResponse = IResultGrid;

export interface ITestConnectionResponse {
  ok: boolean;
  total: number;
  sample: string[];
}

/**
 * Whether the app's own tooling covers a source: whether its structure can be
 * read as tables and typed fields, whether it can be explained, and whether rows
 * can be previewed through the app. Dashboards and the MCP tools are all built on
 * those, so they all read this rather than each deciding for itself.
 *
 * Takes the row for the same reason `canBeAsked` does: a caller holding a stored
 * row should not have to cast it to ask a question about it.
 */
export function canUseTooling(row: { kind: string }): boolean {
  return engineOf(row).supportsTooling;
}
