import {
  ENGINE_SPECS,
  type ConnectionFieldKind,
} from "@heptadec/api/data-source-contracts";
import { FieldInput } from "./FieldInput";
import { maybeFieldOf, type IBlockProps } from "./fields";

export function CommonServerInputs({
  kind,
  mode,
  values,
  onChange,
  children,
}: IBlockProps & { children?: React.ReactNode }) {
  const host = maybeFieldOf(kind, "host");
  const port = maybeFieldOf(kind, "port");
  const socketPath = maybeFieldOf(kind, "socketPath");
  const username = maybeFieldOf(kind, "username");
  const password = maybeFieldOf(kind, "password");
  const database = maybeFieldOf(kind, "database");

  const value = (field: ConnectionFieldKind): string => values[field] ?? "";

  // A socket has no host to reach, so the two are never shown together.
  const viaSocket = mode === "socket" && socketPath !== null;

  return (
    <div className="grid gap-3">
      {viaSocket ? (
        <FieldInput
          field={socketPath}
          value={value("socketPath")}
          onChange={(next) => onChange("socketPath", next)}
        />
      ) : host !== null && port !== null ? (
        <div className="grid grid-cols-[3fr_1fr] gap-3">
          <FieldInput
            field={host}
            value={value("host")}
            onChange={(next) => onChange("host", next)}
          />
          <FieldInput
            field={port}
            value={value("port")}
            onChange={(next) => onChange("port", next)}
            placeholder={String(ENGINE_SPECS[kind].defaultPort)}
          />
        </div>
      ) : host !== null ? (
        <FieldInput
          field={host}
          value={value("host")}
          onChange={(next) => onChange("host", next)}
        />
      ) : null}

      {username !== null || password !== null ? (
        <div className="grid grid-cols-2 gap-3">
          {username !== null ? (
            <FieldInput
              field={username}
              value={value("username")}
              onChange={(next) => onChange("username", next)}
            />
          ) : null}
          {password !== null ? (
            <FieldInput
              field={password}
              value={value("password")}
              onChange={(next) => onChange("password", next)}
            />
          ) : null}
        </div>
      ) : null}

      {children}

      {database !== null ? (
        <FieldInput
          field={database}
          value={value("database")}
          onChange={(next) => onChange("database", next)}
        />
      ) : null}
    </div>
  );
}
