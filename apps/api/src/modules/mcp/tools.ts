import {
  z,
} from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  dataSource,
  type HeptadecDatabase,
} from "@heptadec/db";
import {
  oneRow,
} from "../../common/session/current-organization";
import type { IOrganizationScope } from "../../common/session/current-organization";
import {
  ENGINE_SPECS,
} from "../data-source/contracts";
import { canUseTooling, kindOf } from "../data-source/engines";
import { quoteIdentifier } from "../data-source/sql-quoting";
import {
  savedConnection,
} from "../data-source/connection";
import {
  introspectPostgres,
} from "../schema/postgres";
import {
  runPostgresQuery,
} from "../query/postgres";
import {
  MCP_PERMISSION_RESOURCE,
} from "./capabilities";
import { applyBudget, MAX_BYTES } from "../query/budget";
import { assertSqlReads } from "../query/read-policy";

const MCP_MAX_ROWS = 1_000;

export function registerTools(
  server: McpServer,
  organization: IOrganizationScope,
  permissions: Record<string, string[]> | null,
): void {
  const granted = new Set(permissions?.[MCP_PERMISSION_RESOURCE] ?? []);

  if (granted.has("list_data_sources")) {
    server.registerTool(
      "list_data_sources",
      {
        title: "List data sources",
        description:
          "List the data sources this token's organization can query, with the engine and whether it is read-only.",
        inputSchema: {},
      },
      async () => ({
        content: [
          {
            type: "text",
            text: JSON.stringify(await listDataSources(organization)),
          },
        ],
      }),
    );
  }

  if (granted.has("describe_data_source")) {
    server.registerTool(
      "describe_data_source",
      {
        title: "Describe a data source",
        description:
          "Read the tables, columns, and relationships of one data source the app can describe.",
        inputSchema: {
          dataSourceId: z.string().min(1),
        },
      },
      async ({ dataSourceId }) => {
        const source = await oneRow(organization.db, dataSource, dataSourceId, organization);
        if (source === undefined) {
          return refused(`No data source ${dataSourceId} here`);
        }
        if (!canUseTooling(source)) {
          return refused(`Reading structure is not available for ${kindOf(source)} yet`);
        }
        const described = await introspectPostgres(await savedConnection(source));
        return answered(described);
      },
    );
  }

  if (granted.has("run_query")) {
    server.registerTool(
      "run_query",
      {
        title: "Run a query",
        description:
          "Run one read-only SQL statement against a data source the app can query this way and get the rows back.",
        inputSchema: {
          dataSourceId: z.string().min(1),
          sql: z.string().min(1),
        },
      },
      async ({ dataSourceId, sql }) => {
        const source = await oneRow(organization.db, dataSource, dataSourceId, organization);
        if (source === undefined) {
          return refused(`No data source ${dataSourceId} here`);
        }
        if (!canUseTooling(source)) {
          return refused(`Queries are not available for ${kindOf(source)} yet`);
        }
        if (!source.readOnly) {
          return refused(
            "That data source is writable, so this token will not query it",
          );
        }
        assertSqlReads(sql, "run");
        const grid = await runPostgresQuery(await savedConnection(source), sql);
        const budgeted = applyBudget(grid.rows, {
          maxRows: MCP_MAX_ROWS,
          maxBytes: MAX_BYTES,
        });
        return answered({
          columns: grid.columns,
          columnTypes: grid.columnTypes,
          rowCount: budgeted.rows.length,
          truncated: grid.truncated || budgeted.truncated,
          rows: budgeted.rows,
        });
      },
    );
  }

  if (granted.has("preview_data_source")) {
    server.registerTool(
      "preview_data_source",
      {
        title: "Preview a data source",
        description:
          "Return the first rows of one table in a data source the app can describe, for finding out what is in it.",
        inputSchema: {
          dataSourceId: z.string().min(1),
          table: z.string().min(1),
          limit: z.number().int().min(1).max(MCP_MAX_ROWS).default(20),
        },
      },
      async ({ dataSourceId, table, limit }) => {
        const source = await oneRow(organization.db, dataSource, dataSourceId, organization);
        if (source === undefined) {
          return refused(`No data source ${dataSourceId} here`);
        }
        if (!canUseTooling(source)) {
          return refused(`Previewing is not available for ${kindOf(source)} yet`);
        }
        if (!source.readOnly) {
          return refused(
            "That data source is writable, so this token will not read it",
          );
        }
        const grid = await runPostgresQuery(
          await savedConnection(source),
          `SELECT * FROM ${quoteIdentifier("postgres", table)} LIMIT ${limit}`,
        );
        return answered({
          columns: grid.columns,
          rowCount: grid.rowCount,
          rows: grid.rows,
        });
      },
    );
  }
}

async function listDataSources(organization: IOrganizationScope) {
  const rows = await organization.db
    .select()
    .from(dataSource)
    .where(organization.where(dataSource.organizationId))
    .orderBy(dataSource.name);
  return rows.map((row) => {
    const kind = kindOf(row);
    return {
      id: row.id,
      name: row.name,
      kind,
      engine: ENGINE_SPECS[kind].name,
      readOnly: row.readOnly,
    };
  });
}

function answered(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }] };
}

function refused(reason: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: reason }],
  };
}