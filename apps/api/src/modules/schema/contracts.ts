import type {
  IPreviewObject,
  StructureState,
} from "../data-source/contracts";

export interface ISchemaColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  primaryKey: boolean;
}

export interface ISchemaTable {
  name: string;
  columns: ISchemaColumn[];
  indexedColumns: string[];
}

export interface ISchemaRelationship {
  id: string;
  constraint: string;
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

/**
 * What one engine reports as its catalogue: the objects it holds, the fields
 * inside them, and the keys that join them. Every reader returns this shape, so
 * the diagram the app draws is the same whichever engine it came from.
 */
export interface ISchemaResponse {
  database: string;
  schemaName: string;
  tables: ISchemaTable[];
  relationships: ISchemaRelationship[];
}

/** What one structure sync reads and keeps for one source. */
export interface IStoredStructure {
  objects: IPreviewObject[];
  schema: ISchemaResponse;
}

/**
 * Everything the app can say about a source's structure in one answer: what it
 * stored, how old that is, and what it is doing about it.
 *
 * `objects`, `database`, `schemaName`, `tables` and `relationships` are the last
 * structure a sync read, which outlives the sync that produced it — so a source
 * being re-read still shows what it held, and a source that has never been read
 * shows nothing yet. `stale` describes that payload's age and `state` describes
 * the sync, which is why a re-queue is both.
 *
 * `stored` is false for an engine that keeps no structure — a key space, an index
 * list — whose `objects` were read from the source on the way in.
 */
export interface IStructureResponse {
  sourceId: string;
  stored: boolean;
  state: StructureState;
  syncing: boolean;
  stale: boolean;
  syncedAt: string | null;
  error: string | null;
  objects: IPreviewObject[];
  database: string;
  schemaName: string;
  tables: ISchemaTable[];
  relationships: ISchemaRelationship[];
}
