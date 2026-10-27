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
        // Importing is the URL alone: host, credentials, and the database are
        // all inside the string, so there is nothing else to fill.
        <ConnectionMethod kind={kind} url={url} onUrlChange={onUrlChange} />
      ) : (
        <EngineFields kind={kind} mode={mode} values={values} onChange={onChange} />
      )}
    </div>
  );
}

/**
 * The connection fields alone. A pasted URL fills them in; editing one by
 * hand is what submits, so the paste is only ever an import step.
 */
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
