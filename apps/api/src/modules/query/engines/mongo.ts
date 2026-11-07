import { BadRequestException } from "../../../common/exceptions/index";
import { bsonTypeName, openMongo, toRows } from "../../data-source/clients";
import type { IStoredConnection } from "../../data-source/connection";
import type { IMongoPipeline, IQueryResponse } from "../contracts";
import { applyBudget } from "../budget";
import { assertMongoReads } from "../read-policy";

const MAX_STAGES = 32;

export function readMongoPipeline(value: unknown): IMongoPipeline {
  if (typeof value !== "object" || value === null) {
    throw new BadRequestException("A pipeline is required");
  }
  const body = value as Record<string, unknown>;

  const collection = body.collection;
  if (typeof collection !== "string" || collection.trim().length === 0) {
    throw new BadRequestException("Pick a collection to run the pipeline over");
  }

  const stages = body.pipeline;
  if (!Array.isArray(stages)) {
    throw new BadRequestException("A pipeline must be a list of stages");
  }
  if (stages.length === 0) {
    throw new BadRequestException("Add at least one stage to the pipeline");
  }
  if (stages.length > MAX_STAGES) {
    throw new BadRequestException(
      `A pipeline can hold at most ${MAX_STAGES} stages`,
    );
  }

  for (const stage of stages) {
    checkStage(stage);
  }

  return {
    collection: collection.trim(),
    pipeline: stages as Record<string, unknown>[],
  };
}

function checkStage(stage: unknown): void {
  if (typeof stage !== "object" || stage === null || Array.isArray(stage)) {
    throw new BadRequestException("Each pipeline stage must be an object");
  }
  if (Object.keys(stage).length === 0) {
    throw new BadRequestException("A pipeline stage cannot be empty");
  }
}

function collectColumns(documents: readonly Record<string, unknown>[]): string[] {
  const columns: string[] = [];
  for (const document of documents) {
    addUnknownColumns(columns, document);
  }
  return columns;
}

function addUnknownColumns(columns: string[], document: Record<string, unknown>): void {
  for (const key of Object.keys(document)) {
    if (!columns.includes(key)) {
      columns.push(key);
    }
  }
}

function columnTypeOf(
  documents: readonly Record<string, unknown>[],
  column: string,
): string {
  const first = documents.find((document) => column in document)?.[column];
  return first === undefined ? "null" : bsonTypeName(first);
}

export async function runMongoQuery(
  connection: IStoredConnection,
  pipeline: IMongoPipeline,
): Promise<IQueryResponse> {
  if (connection.readOnly) {
    assertMongoReads(pipeline);
  }

  const startedAt = Date.now();
  const client = openMongo(connection);
  try {
    const documents = await client
      .db(connection.database ?? "")
      .collection(pipeline.collection)
      .aggregate(pipeline.pipeline, { maxTimeMS: 15_000 })
      .toArray();

    const columns = collectColumns(documents);
    const rows = toRows(
      documents.map((document) => ({ ...document })),
    );
    const columnTypes = columns.map((column) =>
      columnTypeOf(documents, column),
    );

    const budgeted = applyBudget(rows);
    return {
      columns,
      columnTypes,
      rows: budgeted.rows,
      rowCount: budgeted.rows.length,
      truncated: budgeted.truncated,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}