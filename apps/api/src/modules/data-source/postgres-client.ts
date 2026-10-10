import pg from "pg";
import type { ConnectionOptions } from "node:tls";
import type { ISavedConnection } from "./connection";

export const STATEMENT_TIMEOUT_MS = 30_000;

export function postgresClient(
  source: ISavedConnection,
  applicationName: string,
): pg.Client {
  const overSocket = source.connectionMode === "socket";
  const startup = [
    ...(source.options === null ? [] : [source.options]),
    ...(source.readOnly ? ["-c default_transaction_read_only=on"] : []),
  ].join(" ");

  return new pg.Client({
    ...(overSocket
      ? { socketPath: source.socketPath ?? "" }
      : { host: source.host, port: source.port }),
    database: source.database,
    user: source.username,
    ...(source.password === null ? {} : { password: source.password }),
    ...(source.connectionMode === "tls" ? { ssl: tls(source) } : {}),
    ...(startup.length === 0 ? {} : { options: startup }),
    statement_timeout: STATEMENT_TIMEOUT_MS,
    connectionTimeoutMillis: 10_000,
    application_name: applicationName,
  });
}

function tls(source: ISavedConnection): ConnectionOptions {
  return {
    ...(source.caCert === null ? {} : { ca: source.caCert }),
    ...(source.clientCert === null ? {} : { cert: source.clientCert }),
    ...(source.clientKey === null ? {} : { key: source.clientKey }),
    rejectUnauthorized: source.caCert !== null,
  };
}
