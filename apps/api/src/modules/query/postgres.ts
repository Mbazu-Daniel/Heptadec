import pg from "pg";
import { BadRequestException } from "../../common/exceptions";
import { driverFailure } from "../../common/driver-error";
import { jsonValue } from "../../common/http/json-value";
import { postgresClient } from "../data-source/postgres-client";
import type { ISavedConnection } from "../data-source/connection";
import type { IExplainNode, IQueryResponse } from "./contracts";

const MAX_ROWS = 10_000;

const MAX_BYTES = 5 * 1024 * 1024;

const SYNTAX_ERROR = /^syntax error|^incomplete input|^unterminated/;

export async function runPostgresQuery(
  source: ISavedConnection,
  sql: string,
): Promise<IQueryResponse> {
  const statement = sql.trim();
  if (statement.length === 0) {
    throw new BadRequestException("Write a statement to run");
  }

  const client = postgresClient(source, "heptadec");

  const startedAt = Date.now();
  await connect(client);
  try {
    const result = await runStatement(client, statement);

    const columns = result.fields.map((field) => field.name);
    const columnTypes = await columnTypeNames(
      client,
      result.fields.map((field) => field.dataTypeID),
    );
    const allRows = (result.rows as Array<Record<string, unknown>>).map(
      (row) => jsonValue(row) as Record<string, unknown>,
    );
    const rows = allRows.slice(0, MAX_ROWS);

    return {
      columns,
      columnTypes,
      rows,
      rowCount: rows.length,
      truncated: allRows.length > rows.length || tooManyBytes(rows),
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await client.end();
  }
}

function tooManyBytes(rows: Array<Record<string, unknown>>): boolean {
  return JSON.stringify(rows).length > MAX_BYTES;
}

export async function explainPostgresQuery(
  source: ISavedConnection,
  sql: string,
): Promise<IExplainNode> {
  const statement = sql.trim().replace(/;+\s*$/, "");
  if (statement.length === 0) {
    throw new BadRequestException("Write a statement to explain");
  }

  const client = postgresClient(source, "heptadec");
  await connect(client);
  try {
    const result = await runStatement(
      client,
      `EXPLAIN (FORMAT JSON) ${statement}`,
    );

    const planRows = result.rows as Array<Record<string, unknown>>;
    const plan = planRows[0]?.["QUERY PLAN"];
    const parsed: unknown = typeof plan === "string" ? JSON.parse(plan) : plan;
    if (!Array.isArray(parsed) || parsed.length !== 1) {
      throw new BadRequestException("That statement could not be explained");
    }
    const root = (parsed[0] as { Plan: IRawPlanNode }).Plan;
    return toExplainNode(root);
  } finally {
    await client.end();
  }
}

interface IRawPlanNode {
  "Node Type": string;
  "Relation Name"?: string;
  "Startup Cost": number;
  "Total Cost": number;
  "Plan Rows": number;
  "Plan Width": number;
  Plans?: IRawPlanNode[];
}

function toExplainNode(node: IRawPlanNode): IExplainNode {
  return {
    nodeType: node["Node Type"],
    relationName: node["Relation Name"] ?? null,
    startupCost: node["Startup Cost"],
    totalCost: node["Total Cost"],
    planRows: node["Plan Rows"],
    planWidth: node["Plan Width"],
    children: (node.Plans ?? []).map(toExplainNode),
  };
}

async function columnTypeNames(
  client: pg.Client,
  oids: number[],
): Promise<string[]> {
  const unique = [...new Set(oids)];
  const found =
    unique.length === 0
      ? { rows: [] as Array<{ oid: string; typname: string }> }
      : await client.query<{ oid: string; typname: string }>(
          "SELECT oid, typname FROM pg_type WHERE oid = ANY($1::oid[])",
          [unique],
        );
  const names = new Map(
    found.rows.map((row) => [Number(row.oid), row.typname]),
  );
  return oids.map((oid) => names.get(oid) ?? "unknown");
}

export async function runStatement(
  client: pg.Client,
  statement: string,
): Promise<pg.QueryResult> {
  try {
    return await client.query({
      name: "heptadec_statement",
      text: statement,
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "";
    if (message.includes("read-only transaction")) {
      throw new BadRequestException(
        "That source is read-only, so it refused the write",
      );
    }
    if (message.includes("multiple commands")) {
      throw new BadRequestException("Run one statement at a time");
    }
    if (message.includes("statement timeout")) {
      throw new BadRequestException("That statement took too long and was cancelled");
    }
    if (SYNTAX_ERROR.test(message)) {
      throw new BadRequestException(
        "That statement could not be parsed — check the spelling",
      );
    }
    throw new BadRequestException(
      driverFailure(caught, "run that statement") ??
        "That statement was refused. Check the tables and columns it names exist and that you can read them.",
    );
  }
}

function connect(client: pg.Client): Promise<void> {
  return client
    .connect()
    .then(() => undefined)
    .catch((caught: unknown) => {
      const failure = driverFailure(caught, "reach that data source");
      if (failure !== null) {
        throw new BadRequestException(failure);
      }
      const message = caught instanceof Error ? caught.message : "";
      if (message.includes("does not exist")) {
        throw new BadRequestException("That database does not exist");
      }
      throw new BadRequestException("That data source could not be reached");
    });
}
