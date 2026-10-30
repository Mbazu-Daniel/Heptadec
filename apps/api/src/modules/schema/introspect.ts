import {
  asRelational,
  databaseName,
  type IStoredConnection,
} from "../data-source/connection";
import {
  bsonTypeName,
  clickhouseClient,
  libsqlClientFor,
  openMongo,
  openMysql,
  quotePostgres,
} from "../data-source/clients";
import { BadRequestException } from "../../common/exceptions";
import { structureFailure } from "../../common/driver-error";
import { engineFrom } from "../data-source/engines";
import type { SqlDialect } from "../data-source/contracts";
import { introspectPostgres } from "./postgres";
import type {
  ISchemaColumn,
  ISchemaRelationship,
  ISchemaResponse,
  ISchemaTable,
} from "./contracts";

export type Introspected = Omit<ISchemaResponse, "sourceId">;

const MAX_TABLES = 500;

type SqlIntrospector = (
  connection: IStoredConnection,
) => Promise<Introspected>;

/**
 * Which dialect reads a structure, not which engine asked for it: MariaDB
 * reports as MySQL and libsql as SQLite, so an engine inherits its reader by
 * naming a dialect in the catalog rather than by being listed here.
 *
 * Keyed by the dialect union, so a dialect added later stops compiling until
 * its reader exists, instead of reaching a throwing default at runtime.
 */
const SQL_INTROSPECTORS: Record<SqlDialect, SqlIntrospector> = {
  postgres: (connection) => introspectPostgres(asRelational(connection)),
  mysql: introspectMysql,
  clickhouse: introspectClickhouse,
  sqlite: introspectSqlite,
};

// Reads the structure of whichever engine the source points at. Which reader to
// use follows from the language and the dialect the catalog says the source
// speaks, so an engine that names SQL and a dialect is read without this file
// having heard of it. A pipeline source is MongoDB, which is where its
// documents come from. Redis and Quickwit have no tables to read, so they are
// refused.
export async function introspectSchema(
  connection: IStoredConnection,
): Promise<Introspected> {
  const engine = engineFrom(connection.kind);
  if (engine.sqlDialect !== null) {
    return SQL_INTROSPECTORS[engine.sqlDialect](connection);
  }
  if (engine.queryLanguage === "pipeline") {
    return introspectMongo(connection);
  }
  throw new BadRequestException(
    `Reading a table structure is not available for ${connection.kind} sources`,
  );
}

// Every engine below reports its catalogue in the shape assemble() expects,
// so the diagram the app draws is the same whichever engine it came from.
interface IColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_key: string;
  is_primary_key: number;
}

interface IIndexRow {
  table_name: string;
  column_name: string;
}

// ------------------------------------------------------------------- mysql

interface IKeyRow {
  constraint_name: string;
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
  ordinal_position: number;
}

const MYSQL_COLUMNS = `
  SELECT TABLE_NAME AS table_name,
         COLUMN_NAME AS column_name,
         COLUMN_TYPE AS data_type,
         IS_NULLABLE AS is_nullable,
         COLUMN_KEY AS column_key
    FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = ?
   ORDER BY TABLE_NAME, ORDINAL_POSITION
`;

const MYSQL_FOREIGN_KEYS = `
  SELECT CONSTRAINT_NAME AS constraint_name,
         TABLE_NAME AS from_table,
         COLUMN_NAME AS from_column,
         REFERENCED_TABLE_NAME AS to_table,
         REFERENCED_COLUMN_NAME AS to_column,
         ORDINAL_POSITION AS ordinal_position
    FROM information_schema.KEY_COLUMN_USAGE
   WHERE TABLE_SCHEMA = ?
     AND REFERENCED_TABLE_NAME IS NOT NULL
   ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION
`;

const MYSQL_INDEXES = `
  SELECT TABLE_NAME AS table_name,
         COLUMN_NAME AS column_name
    FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = ?
     AND INDEX_NAME <> 'PRIMARY'
   ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
`;

async function introspectMysql(
  connection: IStoredConnection,
): Promise<Introspected> {
  const database = databaseName(connection);
  const client = await openMysql(connection);
  try {
    const columns = (await client.query(MYSQL_COLUMNS, [database]))[0] as IColumnRow[];
    const keys = (await client.query(MYSQL_FOREIGN_KEYS, [database]))[0] as IKeyRow[];
    const indexes = (await client.query(MYSQL_INDEXES, [database]))[0] as IIndexRow[];

    return {
      database,
      schemaName: database,
      tables: assemble(columns, indexes),
      relationships: keys.map(toKeyRelationship),
      introspectedAt: new Date().toISOString(),
    };
  } catch (caught) {
    throw new BadRequestException(structureFailure(caught));
  } finally {
    await client.end().catch(() => undefined);
  }
}

// -------------------------------------------------------------- clickhouse

const CLICKHOUSE_COLUMNS = `
  SELECT table AS table_name,
         name AS column_name,
         type AS data_type,
         multiIf(type LIKE 'Nullable(%', 'YES', 'NO') AS is_nullable,
         is_in_primary_key AS is_primary_key
    FROM system.columns
   WHERE database = currentDatabase()
   ORDER BY table, position
`;

async function introspectClickhouse(
  connection: IStoredConnection,
): Promise<Introspected> {
  const client = clickhouseClient(connection, MAX_TABLES);
  try {
    const result = await client.query({
      query: CLICKHOUSE_COLUMNS,
      format: "JSONEachRow",
    });
    const rows = (await result.json()) as IColumnRow[];
    return {
      database: connection.database ?? "",
      schemaName: "default",
      // MergeTree tables carry no foreign keys, so the diagram shows tables only.
      tables: assemble(rows, []),
      relationships: [],
      introspectedAt: new Date().toISOString(),
    };
  } catch (caught) {
    throw new BadRequestException(structureFailure(caught));
  } finally {
    await client.close().catch(() => undefined);
  }
}

// ------------------------------------------------------- sqlite and libsql

interface ISqliteColumnRow {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

interface ISqliteKeyRow {
  table: string;
  from: string;
  to: string;
  id: number;
  seq: number;
}

interface ISqliteIndexRow {
  name: string;
  origin: string;
}

async function introspectSqlite(
  connection: IStoredConnection,
): Promise<Introspected> {
  const client = libsqlClientFor(connection);
  try {
    const names = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );

    const tables: ISchemaTable[] = [];
    const relationships: ISchemaRelationship[] = [];

    for (const row of names.rows.slice(0, MAX_TABLES)) {
      const name = String((row as Record<string, unknown>).name ?? "");
      if (name.length === 0) {
        continue;
      }
      const columns = await client.execute(`PRAGMA table_info(${quotePostgres(name)})`);
      const keys = await client.execute(`PRAGMA foreign_key_list(${quotePostgres(name)})`);
      const indexes = await client.execute(`PRAGMA index_list(${quotePostgres(name)})`);

      tables.push({
        name,
        columns: columns.rows.map((column) => toSqliteColumn(column as unknown as ISqliteColumnRow)),
        indexedColumns: indexes.rows
          .map((index) => index as unknown as ISqliteIndexRow)
          .filter((index) => index.origin !== "pk")
          .map((index) => index.name),
      });

      relationships.push(
        ...keys.rows.map((key) => key as unknown as ISqliteKeyRow).map((key) => ({
          id: `${name}:${key.id}:${key.seq}`,
          constraint: `${name}_fk_${key.id}`,
          fromTable: name,
          fromColumn: key.from,
          toTable: key.table,
          toColumn: key.to,
        })),
      );
    }

    return {
      database: connection.database ?? connection.socketPath ?? connection.host ?? "",
      schemaName: "main",
      tables,
      relationships,
      introspectedAt: new Date().toISOString(),
    };
  } catch (caught) {
    throw new BadRequestException(structureFailure(caught));
  } finally {
    client.close();
  }
}

function toSqliteColumn(row: ISqliteColumnRow): ISchemaColumn {
  return {
    name: row.name,
    dataType: row.type.length === 0 ? "blob" : row.type,
    nullable: row.notnull === 0,
    primaryKey: row.pk > 0,
  };
}

// --------------------------------------------------------------- mongodb

// MongoDB has no catalogue to read: a collection declares nothing until you
// look at its documents. So the structure is inferred by sampling documents and
// unioning the fields they happen to carry, and the reported types are what the
// sample contained rather than a declared schema.
const MAX_SAMPLED_DOCUMENTS = 200;

const MAX_COLLECTION_FIELDS = 200;

const MAX_FIELD_DEPTH = 3;

async function introspectMongo(connection: IStoredConnection): Promise<Introspected> {
  const client = openMongo(connection);
  try {
    const db = client.db(databaseName(connection));
    const listed = await db.listCollections(undefined, { nameOnly: true }).toArray();
    const names = listed
      .map((entry) => entry.name)
      .filter((name) => name.length > 0 && !name.startsWith("system."))
      .sort()
      .slice(0, MAX_TABLES);

    const tables: ISchemaTable[] = [];
    for (const name of names) {
      const collection = db.collection(name);
      const [documents, indexes] = await Promise.all([
        collection.aggregate([{ $sample: { size: MAX_SAMPLED_DOCUMENTS } }]).toArray(),
        collection.indexes(),
      ]);
      tables.push({
        name,
        columns: sampledColumns(documents),
        indexedColumns: indexes.flatMap((index) => Object.keys(index.key)),
      });
    }

    return {
      database: databaseName(connection),
      schemaName: "default",
      tables,
      relationships: [],
      introspectedAt: new Date().toISOString(),
    };
  } catch (caught) {
    throw new BadRequestException(structureFailure(caught));
  } finally {
    await client.close().catch(() => undefined);
  }
}

interface ISampledField {
  name: string;
  types: Set<string>;
  seen: number;
  nullish: number;
}

function sampledColumns(
  documents: Array<Record<string, unknown>>,
): ISchemaColumn[] {
  const fields = new Map<string, ISampledField>();
  for (const document of documents) {
    flattenDocument(document, "", 1, fields);
  }
  return [...fields.values()]
    .slice(0, MAX_COLLECTION_FIELDS)
    .map((field) => ({
      name: field.name,
      dataType: [...field.types].join(" | "),
      nullable: field.nullish > 0 || field.seen < documents.length,
      primaryKey: field.name === "_id",
    }));
}

function flattenDocument(
  document: Record<string, unknown>,
  prefix: string,
  depth: number,
  fields: Map<string, ISampledField>,
): void {
  for (const [key, value] of Object.entries(document)) {
    const name = prefix.length === 0 ? key : `${prefix}.${key}`;
    const field = fields.get(name) ?? { name, types: new Set<string>(), seen: 0, nullish: 0 };
    field.seen += 1;
    if (value === null) {
      field.nullish += 1;
    }
    const type = bsonTypeName(value);
    field.types.add(type);
    fields.set(name, field);
    if (type === "object" && depth < MAX_FIELD_DEPTH) {
      flattenDocument(value as Record<string, unknown>, name, depth + 1, fields);
    }
  }
}

// ------------------------------------------------------------------ shared

function assemble(
  columnRows: IColumnRow[],
  indexRows: IIndexRow[],
): ISchemaTable[] {
  const tables = new Map<string, ISchemaTable>();
  const indexed = new Map<string, string[]>();

  for (const row of columnRows) {
    const table = tables.get(row.table_name) ?? {
      name: row.table_name,
      columns: [],
      indexedColumns: [],
    };
    table.columns.push({
      name: row.column_name,
      dataType: row.data_type,
      nullable: row.is_nullable === "YES",
      primaryKey: row.column_key === "PRI" || row.is_primary_key === 1,
    });
    tables.set(row.table_name, table);
  }

  for (const row of indexRows) {
    const columns = indexed.get(row.table_name);
    if (columns) {
      columns.push(row.column_name);
    } else {
      indexed.set(row.table_name, [row.column_name]);
    }
  }

  return [...tables.values()].map((table) => ({
    ...table,
    indexedColumns: indexed.get(table.name) ?? [],
  }));
}

function toKeyRelationship(row: IKeyRow): ISchemaRelationship {
  return {
    id: `${row.constraint_name}:${row.ordinal_position}`,
    constraint: row.constraint_name,
    fromTable: row.from_table,
    fromColumn: row.from_column,
    toTable: row.to_table,
    toColumn: row.to_column,
  };
}
