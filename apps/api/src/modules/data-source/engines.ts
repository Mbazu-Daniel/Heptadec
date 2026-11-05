import { BadRequestException } from "../../common/exceptions";
import {
  ENGINE_SPECS,
  LANGUAGES,
  type DataSourceKind,
  type IEngineSpec,
} from "./contracts";

export function engineFrom(kind: string): IEngineSpec {
  const spec: IEngineSpec | undefined = ENGINE_SPECS[kind as DataSourceKind];
  if (spec === undefined) {
    throw new BadRequestException(`Unknown data source kind: ${kind}`);
  }
  return spec;
}

export function engineOf(row: { kind: string }): IEngineSpec {
  return engineFrom(row.kind);
}

export function kindOf(row: { kind: string }): DataSourceKind {
  engineFrom(row.kind);
  return row.kind as DataSourceKind;
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
