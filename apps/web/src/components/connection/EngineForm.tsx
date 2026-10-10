import type { ConnectionFieldKind, DataSourceKind } from "@heptadec/api/data-source-contracts";
import {
  ConnectionMethod,
  type ConnectionMethod as ConnectionMethodChoice,
} from "./ConnectionMethod";
import { LibSQLForm, QuickwitForm, SqliteForm } from "./EndpointForms";
import { PostgresForm } from "./PostgresForm";
import { ServerForm } from "./ServerForm";

export function EngineForm({
  kind,
  method,
  url,
  values,
  onMethodChange,
  onUrlChange,
  onChange,
}: {
  kind: DataSourceKind;
  method: ConnectionMethodChoice;
  url: string;
  values: Readonly<Record<string, string>>;
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

      {method === "url" ? null : (
        <Form kind={kind} values={values} onChange={onChange} />
      )}
    </div>
  );
}

function Form({
  kind,
  values,
  onChange,
}: {
  kind: DataSourceKind;
  values: Readonly<Record<string, string>>;
  onChange: (field: ConnectionFieldKind, next: string) => void;
}) {
  const props = { kind, values, onChange };
  switch (kind) {
    case "postgres":
      return <PostgresForm {...props} />;
    case "quickwit":
      return <QuickwitForm {...props} />;
    case "libsql":
      return <LibSQLForm {...props} />;
    case "sqlite":
      return <SqliteForm {...props} />;
    case "mysql":
    case "mariadb":
    case "clickhouse":
    case "redis":
      return <ServerForm {...props} />;
  }
}
