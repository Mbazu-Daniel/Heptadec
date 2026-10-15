import { BadRequestException } from "../../common/exceptions";
import { bsonTypeName, openMongo, toRows } from "../data-source/clients";
import type { IStoredConnection } from "../data-source/connection";
import type { IMongoPipeline, IQueryResponse } from "./contracts";

const MAX_ROWS = 10_000;

const MAX_STAGES = 32;

// A pipeline reads, so the only stages that write are the two that materialise
// their result into a collection.
const WRITING_STAGES = ["$out", "$merge"];

/**
 * Read the aggregation pipeline a request carries. A source stores nothing about
 * how it was queried, so the pipeline arrives whole and is checked here rather
 * than trusting the shape the browser sent.
 */
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
    if (typeof stage !== "object" || stage === null || Array.isArray(stage)) {
      throw new BadRequestException("Each pipeline stage must be an object");
    }
    if (Object.keys(stage).length === 0) {
      throw new BadRequestException("A pipeline stage cannot be empty");
    }
  }

  return {
    collection: collection.trim(),
    pipeline: stages as Record<string, unknown>[],
  };
}

export async function runMongoQuery(
  connection: IStoredConnection,
  pipeline: IMongoPipeline,
  readOnly: boolean,
): Promise<IQueryResponse> {
  if (readOnly) {
    for (const stage of pipeline.pipeline) {
      const name = Object.keys(stage)[0] ?? "";
      if (WRITING_STAGES.includes(name)) {
        throw new BadRequestException(
          `Only read-only pipelines can run here — ${name} writes a collection`,
        );
      }
    }
  }

  const startedAt = Date.now();
  const client = openMongo(connection);
  try {
    const documents = await client
      .db(connection.database ?? "")
      .collection(pipeline.collection)
      .aggregate(pipeline.pipeline, { maxTimeMS: 15_000 })
      .toArray();

    // A document has no declared columns, so the columns are the keys the
    // returned documents actually carry, in the order they first appear.
    const columns: string[] = [];
    for (const document of documents) {
      for (const key of Object.keys(document)) {
        if (!columns.includes(key)) {
          columns.push(key);
        }
      }
    }

    const rows = toRows(
      documents.map((document) => ({ ...document })),
    );
    const columnTypes = columns.map((column) => {
      const first = documents.find((document) => column in document)?.[column];
      return first === undefined ? "null" : bsonTypeName(first);
    });

    return {
      columns,
      columnTypes,
      rows: rows.slice(0, MAX_ROWS),
      rowCount: rows.length,
      truncated: rows.length > MAX_ROWS,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await client.close().catch(() => undefined);
  }
}