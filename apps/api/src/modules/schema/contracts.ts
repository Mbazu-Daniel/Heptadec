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

export interface ISchemaResponse {
  sourceId: string;
  database: string;
  schemaName: string;
  tables: ISchemaTable[];
  relationships: ISchemaRelationship[];
  introspectedAt: string;
}
