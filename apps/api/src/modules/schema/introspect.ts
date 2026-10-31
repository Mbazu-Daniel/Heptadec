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
  toRows,
} from "../data-source/clients";
import { BadRequestException } from "../../common/exceptions";
import { isJsonObject } from "../../common/http/body";
import { structureFailure } from "../../common/driver-error";
import { engineFrom } from "../data-source/engines";
import type {
  IEngineSpec,
  SqlDialect,
} from "../data-source/contracts";
import { introspectPostgres } from "./postgres";
import type {
  ISchemaColumn,
  ISchemaRelationship,
  ISchemaResponse,
  ISchemaTable,
} from "./contracts";

const MAX_TABLES = 500;

type SqlIntrospector = (
  connection: IStoredConnection,
) => Promise<ISchemaResponse>;

const SQL_INTROSPECTORS: Record<SqlDialect, SqlIntrospector> = {
  postgres: (connection) => introspectPostgres(asRelational(connection)),
  mysql: introspectMysql,
  clickhouse: introspectClickhouse,
  sqlite: introspectSqlite,
};

/**
 * Whether an engine keeps a catalogue the app can read and store: tables and
 * columns, or collections and the fields their documents carry. Redis answers
 * with its key space and Quickwit with its index list — that is the data itself,
 * or one cheap call away — so those are read live and never stored.
 */
export function readsStructure(engine: IEngineSpec): boolean {
  return engine.sqlDialect !== null || engine.queryLanguage === "pipeline";
}

export async function introspectSchema(
  connection: IStoredConnection,
): Promise<ISchemaResponse> {
  const engine = engineFrom(connection.kind);
  if (!readsStructure(engine)) {
    throw new BadRequestException(
      `Reading a table structure is not available for ${connection.kind} sources`,
    );
  }
  return engine.sqlDialect === null
    ? introspectMongo(connection)
    : SQL_INTROSPECTORS[engine.sqlDialect](connection);
}

type DriverRow = Record<string, unknown>;

function textField(row: DriverRow, field: string): string {
  const value = row[field];
  return typeof value === "string" ? value : "";
}

function numberField(row: DriverRow, field: string): number {
  const value = row[field];
  return typeof value === "number" ? value : 0;
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
): Promise<ISchemaResponse> {
  const database = databaseName(connection);
  const client = await openMysql(connection);
  try {
    const [columnRows] = await client.query(MYSQL_COLUMNS, [database]);
    const [keyRows] = await client.query(MYSQL_FOREIGN_KEYS, [database]);
    const [indexRows] = await client.query(MYSQL_INDEXES, [database]);
    const columns = toRows(columnRows as DriverRow[]);
    const keys = toRows(keyRows as DriverRow[]);
    const indexes = toRows(indexRows as DriverRow[]);

    return {
      database,
      schemaName: database,
      tables: assemble(columns, indexes),
      relationships: keys.map(toKeyRelationship),
    };
  } catch (caught) {
    throw new BadRequestException(structureFailure(caught));
  } finally {
    await client.end().catch(() => undefined);
  }
}


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
): Promise<ISchemaResponse> {
  const client = clickhouseClient(connection, MAX_TABLES);
  try {
    const result = await client.query({
      query: CLICKHOUSE_COLUMNS,
      format: "JSONEachRow",
    });
    const rows = toRows((await result.json()) as DriverRow[]);
    return {
      database: connection.database ?? "",
      schemaName: "default",
      tables: assemble(rows, []),
      relationships: [],
    };
  } catch (caught) {
    throw new BadRequestException(structureFailure(caught));
  } finally {
    await client.close().catch(() => undefined);
  }
}


async function introspectSqlite(
  connection: IStoredConnection,
): Promise<ISchemaResponse> {
  const client = libsqlClientFor(connection);
  try {
    const names = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );

    const tables: ISchemaTable[] = [];
    const relationships: ISchemaRelationship[] = [];

    for (const row of names.rows.slice(0, MAX_TABLES)) {
      const name = textField(row, "name");
      if (name.length === 0) {
        continue;
      }
      const columns = await client.execute(`PRAGMA table_info(${quotePostgres(name)})`);
      const keys = await client.execute(`PRAGMA foreign_key_list(${quotePostgres(name)})`);
      const indexes = await client.execute(`PRAGMA index_list(${quotePostgres(name)})`);

      tables.push({
        name,
        columns: columns.rows.map(toSqliteColumn),
        indexedColumns: indexes.rows
          .filter((index) => textField(index, "origin") !== "pk")
          .map((index) => textField(index, "name")),
      });

      relationships.push(
        ...keys.rows.map((key) => {
          const id = numberField(key, "id");
          const seq = numberField(key, "seq");
          return {
            id: `${name}:${id}:${seq}`,
            constraint: `${name}_fk_${id}`,
            fromTable: name,
            fromColumn: textField(key, "from"),
            toTable: textField(key, "table"),
            toColumn: textField(key, "to"),
          };
        }),
      );
    }

    return {
      database: connection.database ?? connection.socketPath ?? connection.host ?? "",
      schemaName: "main",
      tables,
      relationships,
    };
  } catch (caught) {
    throw new BadRequestException(structureFailure(caught));
  } finally {
    client.close();
  }
}

function toSqliteColumn(row: DriverRow): ISchemaColumn {
  const dataType = textField(row, "type");
  return {
    name: textField(row, "name"),
    dataType: dataType.length === 0 ? "blob" : dataType,
    nullable: numberField(row, "notnull") === 0,
    primaryKey: numberField(row, "pk") > 0,
  };
}


const MAX_SAMPLED_DOCUMENTS = 200;

const MAX_COLLECTION_FIELDS = 200;

const MAX_FIELD_DEPTH = 3;

async function introspectMongo(connection: IStoredConnection): Promise<ISchemaResponse> {
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
    if (type === "object" && isJsonObject(value) && depth < MAX_FIELD_DEPTH) {
      flattenDocument(value, name, depth + 1, fields);
    }
  }
}


function assemble(
  columnRows: DriverRow[],
  indexRows: DriverRow[],
): ISchemaTable[] {
  const tables = new Map<string, ISchemaTable>();
  const indexed = new Map<string, string[]>();

  for (const row of columnRows) {
    const tableName = textField(row, "table_name");
    const table = tables.get(tableName) ?? {
      name: tableName,
      columns: [],
      indexedColumns: [],
    };
    table.columns.push({
      name: textField(row, "column_name"),
      dataType: textField(row, "data_type"),
      nullable: textField(row, "is_nullable") === "YES",
      primaryKey:
        textField(row, "column_key") === "PRI" ||
        numberField(row, "is_primary_key") === 1,
    });
    tables.set(tableName, table);
  }

  for (const row of indexRows) {
    const tableName = textField(row, "table_name");
    const columnName = textField(row, "column_name");
    const columns = indexed.get(tableName);
    if (columns) {
      columns.push(columnName);
    } else {
      indexed.set(tableName, [columnName]);
    }
  }

  return [...tables.values()].map((table) => ({
    ...table,
    indexedColumns: indexed.get(table.name) ?? [],
  }));
}

function toKeyRelationship(row: DriverRow): ISchemaRelationship {
  const constraint = textField(row, "constraint_name");
  return {
    id: `${constraint}:${numberField(row, "ordinal_position")}`,
    constraint,
    fromTable: textField(row, "from_table"),
    fromColumn: textField(row, "from_column"),
    toTable: textField(row, "to_table"),
    toColumn: textField(row, "to_column"),
  };
}
