import { BadRequestException } from "../../common/exceptions";
import {
  ENGINE_SPECS,
  LANGUAGES,
  type DataSourceKind,
  type IEngineSpec,
} from "./contracts";

/**
 * The only place a stored `kind` becomes a typed engine.
 *
 * The column is text with no constraint — `packages/db` is schema-only and must
 * not learn the engine catalog — so every reader used to cast the row itself
 * (`row.kind as DataSourceKind`), making each one a private assertion that the
 * database was telling the truth. An engine the catalog has never heard of is an
 * error here, once, instead of a lie at every use site.
 *
 * It sits beside the catalog rather than in it because the catalog is data the
 * browser imports at runtime — the web reads `ENGINE_SPECS` to draw a connection
 * form — and a module that answers with an HTTP exception would drag the
 * exception layer, and `hono/http-exception` with it, into that bundle. A
 * submitted kind is refused at the boundary it arrives at, so what is left for
 * this to catch is a stored kind no deploy can read.
 */
export function engineFrom(kind: string): IEngineSpec {
  const spec: IEngineSpec | undefined = ENGINE_SPECS[kind as DataSourceKind];
  if (spec === undefined) {
    throw new BadRequestException(`Unknown data source kind: ${kind}`);
  }
  return spec;
}

/** The engine a stored row is. */
export function engineOf(row: { kind: string }): IEngineSpec {
  return engineFrom(row.kind);
}

/**
 * The kind a stored row is, as a name rather than a spec. The cast is safe
 * because `engineFrom` has already proven the catalog knows this string.
 */
export function kindOf(row: { kind: string }): DataSourceKind {
  engineFrom(row.kind);
  return row.kind as DataSourceKind;
}

/**
 * Whether a source can be put to the AI. A source is asked in a language it
 * names, and a language that exists is one the app can read back; one that does
 * not — an engine with no query language of its own — cannot be asked at all.
 *
 * Takes the row rather than a kind so that a caller never has to cast a stored
 * string on the way to asking a question about it.
 */
export function canBeAsked(row: { kind: string }): boolean {
  return engineOf(row).queryLanguage !== null;
}

/**
 * Whether a source's statements can be kept as a Saved Query, and therefore
 * whether one of them can be put on a Schedule or watched by an Alert Rule.
 */
export function canBeSaved(row: { kind: string }): boolean {
  const language = engineOf(row).queryLanguage;
  return language !== null && LANGUAGES[language].savable;
}

/**
 * Whether the app's own tooling covers a source: whether its structure can be
 * read as tables and typed fields, whether it can be explained, and whether rows
 * can be previewed through the app. Dashboards and the MCP tools are all built on
 * those, so they all read this rather than each deciding for itself.
 *
 * Takes the row for the same reason `canBeAsked` does: a caller holding a stored
 * row should not have to cast it to ask a question about it.
 */
export function canUseTooling(row: { kind: string }): boolean {
  return engineOf(row).supportsTooling;
}
