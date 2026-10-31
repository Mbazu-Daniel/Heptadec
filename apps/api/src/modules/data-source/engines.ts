import { BadRequestException } from "../../common/exceptions";
import {
  ENGINE_SPECS,
  LANGUAGES,
  isDataSourceKind,
  type DataSourceKind,
  type IEngineSpec,
} from "./contracts";

function readKind(kind: string): DataSourceKind {
  if (!isDataSourceKind(kind)) {
    throw new BadRequestException(`Unknown data source kind: ${kind}`);
  }
  return kind;
}

export function engineFrom(kind: string): IEngineSpec {
  return ENGINE_SPECS[readKind(kind)];
}

export function engineOf(row: { kind: string }): IEngineSpec {
  return engineFrom(row.kind);
}

export function kindOf(row: { kind: string }): DataSourceKind {
  return readKind(row.kind);
}

export function canBeAsked(row: { kind: string }): boolean {
  return engineOf(row).queryLanguage !== null;
}

export function canBeSaved(row: { kind: string }): boolean {
  const language = engineOf(row).queryLanguage;
  return language !== null && LANGUAGES[language].savable;
}

export function canUseTooling(row: { kind: string }): boolean {
  return engineOf(row).supportsTooling;
}
