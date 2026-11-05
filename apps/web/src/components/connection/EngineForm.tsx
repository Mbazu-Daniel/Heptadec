import {
  type ConnectionFieldKind,
  type ConnectionMode,
  type DataSourceKind,
} from "@heptadec/api/data-source-contracts";
import { ConnectionMethod } from "./ConnectionMethod";
import { LibSQLForm, QuickwitForm, SqliteForm } from "./EndpointForms";
import { type IBlockProps } from "./fields";
import { PostgresForm } from "./PostgresForm";
import { ServerForm } from "./ServerForm";
import type { ReactElement } from "react";

export function EngineForm({
  kind,
  mode,
  url,
  values,
  showUrlImport,
  onUrlChange,
  onChange,
}: {
  kind: DataSourceKind;
  mode: ConnectionMode | null;
  url: string;
  values: Readonly<Record<string, string>>;
  showUrlImport: boolean;
  onUrlChange: (next: string) => void;
  onChange: (field: ConnectionFieldKind, next: string) => void;
}) {
  return (
    <div className="grid gap-4">
      {showUrlImport ? (
        <ConnectionMethod kind={kind} url={url} onUrlChange={onUrlChange} />
      ) : (
        <EngineFields kind={kind} mode={mode} values={values} onChange={onChange} />
      )}
    </div>
  );
}

export function EngineFields({
  kind,
  mode,
  values,
  onChange,
}: {
  kind: DataSourceKind;
  mode: ConnectionMode | null;
  values: Readonly<Record<string, string>>;
  onChange: (field: ConnectionFieldKind, next: string) => void;
}) {
  return (
    <>
      <Form kind={kind} mode={mode} values={values} onChange={onChange} />
    </>
  );
}

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
