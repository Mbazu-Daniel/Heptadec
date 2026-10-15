import {
  ENGINE_SPECS,
  type ConnectionFieldKind,
  type ConnectionMode,
  type DataSourceKind,
  type IConnectionField,
} from "@heptadec/api/data-source-contracts";

export interface IBlockProps {
  kind: DataSourceKind;
  mode: ConnectionMode | null;
  values: Readonly<Record<string, string>>;
  onChange: (field: ConnectionFieldKind, next: string) => void;
}

/**
 * The connection modes an engine offers, taken from the fields that only appear
 * under one. An engine whose fields carry no modes has nothing to choose.
 */
export function connectionModeOptions(
  kind: DataSourceKind,
): readonly ConnectionMode[] {
  const fields: readonly IConnectionField[] = ENGINE_SPECS[kind].fields;
  const modes = new Set<ConnectionMode>();
  for (const field of fields) {
    for (const mode of field.modes ?? []) {
      modes.add(mode);
    }
  }
  return [...modes];
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
