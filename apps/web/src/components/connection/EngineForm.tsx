import {
  type ConnectionFieldKind,
  type ConnectionMode,
  type DataSourceKind,
} from "@heptadec/api/data-source-contracts";
import {
  ConnectionMethod,
  type ConnectionMethod as ConnectionMethodChoice,
} from "./ConnectionMethod";
import { LibSQLForm, QuickwitForm, SqliteForm } from "./EndpointForms";
import { type IBlockProps, connectionModeOptions } from "./fields";
import { PostgresForm } from "./PostgresForm";
import { ServerForm } from "./ServerForm";
import type { ReactElement } from "react";

const MODE_LABELS: Record<ConnectionMode, string> = {
  tcp: "TCP",
  tls: "TLS",
  socket: "Unix socket",
};

export function EngineForm({
  kind,
  mode,
  method,
  url,
  values,
  onModeChange,
  onMethodChange,
  onUrlChange,
  onChange,
}: {
  kind: DataSourceKind;
  mode: ConnectionMode | null;
  method: ConnectionMethodChoice;
  url: string;
  values: Readonly<Record<string, string>>;
  onModeChange: (next: ConnectionMode | null) => void;
  onMethodChange: (next: ConnectionMethodChoice) => void;
  onUrlChange: (next: string) => void;
  onChange: (field: ConnectionFieldKind, next: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <ConnectionMethod
        kind={kind}
        method={method}
        url={url}
        onMethodChange={onMethodChange}
        onUrlChange={onUrlChange}
      />
      <EngineFields
        kind={kind}
        mode={mode}
        values={values}
        onModeChange={onModeChange}
        onChange={onChange}
      />
    </div>
  );
}

/**
 * The connection fields alone, without the choice between typing them and
 * pasting a whole connection URL. Editing a source is always field by field,
 * since the URL it was built from is not kept.
 */
export function EngineFields({
  kind,
  mode,
  values,
  onModeChange,
  onChange,
}: {
  kind: DataSourceKind;
  mode: ConnectionMode | null;
  values: Readonly<Record<string, string>>;
  onModeChange: (next: ConnectionMode | null) => void;
  onChange: (field: ConnectionFieldKind, next: string) => void;
}) {
  const modes = connectionModeOptions(kind);

  return (
    <>
      {modes.length > 1 ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-muted-foreground">Connection mode</span>
          <select
            value={mode ?? ""}
            onChange={(event) =>
              onModeChange(event.target.value as ConnectionMode)
            }
            className="h-10 rounded-md border border-input bg-background px-3 font-mono text-sm text-foreground"
          >
            {modes.map((option) => (
              <option key={option} value={option}>
                {MODE_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <Form kind={kind} mode={mode} values={values} onChange={onChange} />
    </>
  );
}

/**
 * The block of fields one engine shows. Keyed by the union, so an engine added
 * to the catalog stops compiling here until its form exists, rather than
 * rendering an empty block at runtime: the switch this replaces had no default
 * and no exemption from returning, so nothing checked that it was complete.
 */
const FORMS: Record<DataSourceKind, (props: IBlockProps) => ReactElement> = {
  postgres: PostgresForm,
  quickwit: QuickwitForm,
  libsql: LibSQLForm,
  sqlite: SqliteForm,
  mysql: ServerForm,
  mariadb: ServerForm,
  clickhouse: ServerForm,
  mongodb: ServerForm,
  redis: ServerForm,
};

function Form(props: IBlockProps) {
  const Chosen = FORMS[props.kind];
  return <Chosen {...props} />;
}
