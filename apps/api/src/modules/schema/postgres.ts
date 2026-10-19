import pg from "pg";
import { BadRequestException } from "../../common/exceptions";
import { structureFailure } from "../../common/driver-error";
import { postgresClient } from "../data-source/postgres-client";
import type { ISavedConnection } from "../data-source/connection";
import type {
  ISchemaColumn,
  ISchemaRelationship,
  ISchemaResponse,
  ISchemaTable,
} from "./contracts";

export async function introspectPostgres(
  source: ISavedConnection,
): Promise<Omit<ISchemaResponse, "sourceId">> {
  const client = postgresClient(source, "heptadec-schema");

  await connect(client);
  try {
    const schema = source.schemaName ?? DEFAULT_SCHEMA;
    const columns = await client.query<IColumnRow>(COLUMNS_SQL, [schema]);
    const foreignKeys = await client.query<IForeignKeyRow>(FOREIGN_KEYS_SQL, [schema]);
    const indexes = await client.query<IIndexRow>(INDEXES_SQL, [schema]);

    return {
      database: source.database,
      schemaName: schema,
      tables: assemble(columns.rows, indexes.rows),
      relationships: foreignKeys.rows.map(toRelationship),
      introspectedAt: new Date().toISOString(),
    };
  } catch (caught) {
    throw new BadRequestException(structureFailure(caught));
  } finally {
    await client.end();
  }
}

interface IColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  nullable: boolean;
  is_primary_key: boolean;
}

interface IForeignKeyRow {
  constraint_name: string;
  position: number;
  from_table: string;
  from_column: string;
  to_table: string;
  to_column: string;
}

interface IIndexRow {
  table_name: string;
  column_name: string;
}

const DEFAULT_SCHEMA = "public";

const COLUMNS_SQL = `
select
  cls.relname                                  as table_name,
  att.attname                                  as column_name,
  pg_catalog.format_type(att.atttypid, att.atttypmod) as data_type,
  not att.attnotnull                           as nullable,
  exists (
    select 1
    from pg_catalog.pg_constraint con
    where con.conrelid = cls.oid
      and con.contype = 'p'
      and att.attnum = any (con.conkey)
  )                                           as is_primary_key
from pg_catalog.pg_class cls
join pg_catalog.pg_namespace nsp on nsp.oid = cls.relnamespace
join pg_catalog.pg_attribute att
  on att.attrelid = cls.oid and att.attnum > 0 and not att.attisdropped
where cls.relkind = 'r'
  and nsp.nspname = $1
order by cls.relname, att.attnum
`;

const FOREIGN_KEYS_SQL = `
select
  con.conname    as constraint_name,
  pair.position  as position,
  src.relname    as from_table,
  src_att.attname as from_column,
  tgt.relname    as to_table,
  tgt_att.attname as to_column
from pg_catalog.pg_constraint con
join pg_catalog.pg_class src on src.oid = con.conrelid
join pg_catalog.pg_namespace nsp on nsp.oid = src.relnamespace
join pg_catalog.pg_class tgt on tgt.oid = con.confrelid
cross join lateral unnest(con.conkey, con.confkey)
  with ordinality as pair(src_attnum, tgt_attnum, position)
join pg_catalog.pg_attribute src_att
  on src_att.attrelid = con.conrelid and src_att.attnum = pair.src_attnum
join pg_catalog.pg_attribute tgt_att
  on tgt_att.attrelid = con.confrelid and tgt_att.attnum = pair.tgt_attnum
where con.contype = 'f'
  and nsp.nspname = $1
order by src.relname, src_att.attname, pair.position
`;

const INDEXES_SQL = `
select
  cls.relname    as table_name,
  att.attname    as column_name
from pg_catalog.pg_index idx
join pg_catalog.pg_class cls on cls.oid = idx.indrelid
join pg_catalog.pg_namespace nsp on nsp.oid = cls.relnamespace
cross join lateral unnest(idx.indkey) with ordinality as key(attnum, position)
join pg_catalog.pg_attribute att
  on att.attrelid = cls.oid and att.attnum = key.attnum
where nsp.nspname = $1
  and idx.indisvalid
  and not idx.indisprimary
order by cls.relname, key.position
`;

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
    table.columns.push(toColumn(row));
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

function toColumn(row: IColumnRow): ISchemaColumn {
  return {
    name: row.column_name,
    dataType: row.data_type,
    nullable: row.nullable,
    primaryKey: row.is_primary_key,
  };
}

function toRelationship(row: IForeignKeyRow): ISchemaRelationship {
  return {
    id: `${row.constraint_name}:${row.position}`,
    constraint: row.constraint_name,
    fromTable: row.from_table,
    fromColumn: row.from_column,
    toTable: row.to_table,
    toColumn: row.to_column,
  };
}

function connect(client: pg.Client): Promise<void> {
  return client
    .connect()
    .then(() => undefined)
    .catch((caught: unknown) => {
      throw new BadRequestException(structureFailure(caught));
    });
}
