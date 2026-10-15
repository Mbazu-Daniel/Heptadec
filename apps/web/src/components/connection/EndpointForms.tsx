import { FieldInput } from "./FieldInput";
import { fieldOf, type IBlockProps } from "./fields";

export function QuickwitForm(props: IBlockProps) {
  const endpoint = fieldOf("quickwit", "endpoint");
  const index = fieldOf("quickwit", "database");
  const token = fieldOf("quickwit", "token");

  return (
    <div className="grid gap-3">
      <FieldInput
        field={endpoint}
        value={props.values[endpoint.kind] ?? ""}
        onChange={(next) => props.onChange(endpoint.kind, next)}
      />
      <FieldInput
        field={index}
        value={props.values[index.kind] ?? ""}
        onChange={(next) => props.onChange(index.kind, next)}
      />
      <FieldInput
        field={token}
        value={props.values[token.kind] ?? ""}
        onChange={(next) => props.onChange(token.kind, next)}
      />
    </div>
  );
}

export function LibSQLForm(props: IBlockProps) {
  const endpoint = fieldOf("libsql", "endpoint");
  const token = fieldOf("libsql", "token");

  return (
    <div className="grid gap-3">
      <FieldInput
        field={endpoint}
        value={props.values[endpoint.kind] ?? ""}
        onChange={(next) => props.onChange(endpoint.kind, next)}
      />
      <FieldInput
        field={token}
        value={props.values[token.kind] ?? ""}
        onChange={(next) => props.onChange(token.kind, next)}
      />
    </div>
  );
}

export function SqliteForm(props: IBlockProps) {
  const filePath = fieldOf("sqlite", "filePath");
  return (
    <FieldInput
      field={filePath}
      value={props.values[filePath.kind] ?? ""}
      onChange={(next) => props.onChange(filePath.kind, next)}
    />
  );
}
