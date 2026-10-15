import pg from "pg";
import { BadRequestException } from "../../common/exceptions";
import type { ConnectionOptions } from "node:tls";
import type { ISavedConnection } from "./connection";

export const STATEMENT_TIMEOUT_MS = 30_000;

export function postgresClient(
  source: ISavedConnection,
  applicationName: string,
): pg.Client {
  const overSocket = source.connectionMode === "socket";
  // A socket source has no host to dial and a TCP one has no socket, so each
  // branch carries only what it will actually use rather than both, defaulted.
  const dial: { socketPath: string } | { host: string; port: number } = overSocket
    ? source.socketPath === null
      ? notConnectable()
      : { socketPath: source.socketPath }
    : source.host === null || source.port === null
      ? notConnectable()
      : { host: source.host, port: source.port };
  const startup = [
    ...(source.options === null ? [] : [source.options]),
    ...(source.readOnly ? ["-c default_transaction_read_only=on"] : []),
  ].join(" ");

  return new pg.Client({
    ...dial,
    database: source.database,
    ...(source.username === null ? {} : { user: source.username }),
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

/** A source that names neither a host nor a socket cannot be dialled. */
function notConnectable(): never {
  throw new BadRequestException("That source is missing connection details");
}
