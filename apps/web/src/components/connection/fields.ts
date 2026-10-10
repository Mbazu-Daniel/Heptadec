import {
  ENGINE_SPECS,
  type ConnectionFieldKind,
  type DataSourceKind,
  type IConnectionField,
} from "@heptadec/api/data-source-contracts";

export interface IBlockProps {
  kind: DataSourceKind;
  values: Readonly<Record<string, string>>;
  onChange: (field: ConnectionFieldKind, next: string) => void;
}

export function fieldOf(kind: DataSourceKind, field: ConnectionFieldKind): IConnectionField {
  const found = ENGINE_SPECS[kind].fields.find((candidate) => candidate.kind === field);
  if (found === undefined) {
    throw new Error(`${ENGINE_SPECS[kind].name} has no ${field} field`);
  }
  return found;
}

export function maybeFieldOf(
  kind: DataSourceKind,
  field: ConnectionFieldKind,
): IConnectionField | null {
  return ENGINE_SPECS[kind].fields.find((candidate) => candidate.kind === field) ?? null;
}
