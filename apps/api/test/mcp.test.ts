import { afterAll, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { authFor } from "../src/common/config/better-auth";
import { MCP_TOOLS } from "../src/modules/mcp/contracts";
import { app, db, request, signUp, TEST_POSTGRES, uniqueEmail, uniqueSlug } from "./helpers";

let base = "";

async function startServer(): Promise<string> {
  if (base !== "") {
    return base;
  }
  const { serve } = await import("@hono/node-server");
  const listening = await new Promise<{
    port: number;
    close: () => Promise<void>;
  }>((resolve) => {
    const server = serve(
      {
        fetch: (request: Request) => app.fetch(request, { db }),
        port: 0,
        hostname: "127.0.0.1",
      },
      (info) => {
        resolve({
          port: info.port,
          close: async () => {
            const node = server as unknown as {
              closeAllConnections?: () => void;
              close: (done: () => void) => void;
            };
            node.closeAllConnections?.();
            await new Promise<void>((done) => node.close(() => done()));
          },
        });
      },
    );
  });
  base = `http://127.0.0.1:${listening.port}`;
  afterAll(listening.close);
  return base;
}

async function ownerWithSource(readOnly: boolean): Promise<{
  cookie: string;
  dataSourceId: string;
}> {
  const { cookie } = await signUp(uniqueEmail());
  await authFor(db).api.createOrganization({
    body: { name: "MCP Org", slug: uniqueSlug() },
    headers: { cookie },
  });

  const created = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Seeded events",
      host: TEST_POSTGRES.host,
      port: TEST_POSTGRES.port,
      database: TEST_POSTGRES.database,
      username: TEST_POSTGRES.user,
      password: TEST_POSTGRES.password,
      readOnly,
    }),
  });
  expect(created.status).toBe(200);
  const body = (await created.json()) as { dataSource: { id: string } };
  return { cookie, dataSourceId: body.dataSource.id };
}

async function issueToken(cookie: string, name = "laptop"): Promise<string> {
  const res = await request("/api/mcp-tokens", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name, capabilities: [...MCP_TOOLS] }),
  });
  const text = await res.text();
  expect(res.status, text).toBe(201);
  const body = JSON.parse(text) as { token: string };
  return body.token;
}

async function connect(token: string): Promise<Client> {
  const client = new Client({ name: "heptadec-test-client", version: "0.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${await startServer()}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } },
    }),
  );
  return client;
}

interface IToolResult {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
}

function textOf(result: unknown): string {
  return (result as IToolResult)
    .content.map((part) => part.text ?? "")
    .join("")
    .trim();
}

async function rpc(token: string | null, method: string): Promise<Response> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (token !== null) {
    headers.authorization = `Bearer ${token}`;
  }
  return fetch(`${await startServer()}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {} }),
  });
}

it("lists tools and runs a query with a real MCP client", async () => {
  const { cookie, dataSourceId } = await ownerWithSource(true);
  const client = await connect(await issueToken(cookie));

  const tools = await client.listTools();
  expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
    "describe_data_source",
    "list_data_sources",
    "preview_data_source",
    "run_query",
  ]);

  const listed = await client.callTool({ name: "list_data_sources", arguments: {} });
  const sources = JSON.parse(textOf(listed)) as Array<{
    id: string;
    readOnly: boolean;
  }>;
  expect(sources).toHaveLength(1);
  expect(sources[0]!.id).toBe(dataSourceId);
  expect(sources[0]!.readOnly).toBe(true);

  const ran = await client.callTool({
    name: "run_query",
    arguments: {
      dataSourceId,
      sql: "SELECT region, count(*)::int AS events FROM events GROUP BY region ORDER BY region",
    },
  });
  expect(ran.isError).toBeFalsy();
  const grid = JSON.parse(textOf(ran)) as {
    columns: string[];
    rowCount: number;
    rows: Array<Record<string, unknown>>;
  };
  expect(grid.columns).toEqual(["region", "events"]);
  expect(grid.rowCount).toBeGreaterThan(0);
  expect(grid.rows[0]).toHaveProperty("events");

  const described = await client.callTool({
    name: "describe_data_source",
    arguments: { dataSourceId },
  });
  const structure = JSON.parse(textOf(described)) as {
    tables: Array<{ name: string }>;
  };
  expect(structure.tables.map((table) => table.name)).toContain("events");

  await client.close();
});

it("refuses to query a writable source", async () => {
  const { cookie, dataSourceId } = await ownerWithSource(false);
  const client = await connect(await issueToken(cookie));

  const ran = await client.callTool({
    name: "run_query",
    arguments: { dataSourceId, sql: "SELECT 1" },
  });
  expect(ran.isError).toBe(true);
  expect(textOf(ran)).toContain("writable");

  await client.close();
});

it("keeps one organization's data out of another's reach", async () => {
  const mine = await ownerWithSource(true);
  const theirs = await ownerWithSource(true);
  const client = await connect(await issueToken(mine.cookie));

  const peeked = await client.callTool({
    name: "describe_data_source",
    arguments: { dataSourceId: theirs.dataSourceId },
  });
  expect(peeked.isError).toBe(true);
  expect(textOf(peeked)).toContain("No data source");

  await client.close();
});

it("refuses writes at the database, so read-only holds even when SQL asks", async () => {
  const { cookie, dataSourceId } = await ownerWithSource(true);
  const client = await connect(await issueToken(cookie));

  const wrote = await client.callTool({
    name: "run_query",
    arguments: {
      dataSourceId,
      sql: "INSERT INTO events (id, event_name, region) VALUES ('mcp-write', 'x', 'eu')",
    },
  });
  expect(wrote.isError).toBe(true);
  expect(textOf(wrote)).toContain("read-only");

  await client.close();
});

it("stops honouring a revoked token", async () => {
  const { cookie } = await ownerWithSource(true);
  const token = await issueToken(cookie);
  const client = await connect(token);
  expect((await client.listTools()).tools.length).toBeGreaterThan(0);
  await client.close();

  const listed = await request("/api/mcp-tokens", { headers: { cookie } });
  const rows = (await listed.json()) as { tokens: Array<{ id: string }> };
  expect(rows.tokens).toHaveLength(1);

  const revoked = await request(`/api/mcp-tokens/${rows.tokens[0]!.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  expect(revoked.status).toBe(200);

  const after = await rpc(token, "tools/list");
  expect(after.status).toBe(401);
});

it("refuses a request with no token at all", async () => {
  const res = await rpc(null, "tools/list");
  expect(res.status).toBe(401);
});

it("never hands the raw token back after creation", async () => {
  const { cookie } = await ownerWithSource(true);
  const token = await issueToken(cookie);

  const res = await request("/api/mcp-tokens", { headers: { cookie } });
  const body = await res.text();
  expect(body).not.toContain(token);
  expect(body).not.toContain("hdc_");
});

it("stops a token that asks too often", async () => {
  const { cookie } = await ownerWithSource(true);
  const token = await issueToken(cookie);

  const codes: number[] = [];
  for (let i = 0; i < 200; i += 1) {
    const res = await rpc(token, "tools/list");
    codes.push(res.status);
    if (res.status === 429) {
      break;
    }
  }

  expect(codes.at(-1)).toBe(429);
  expect(codes.filter((code) => code === 429)).toHaveLength(1);
});

it("refuses a token that was never issued", async () => {
  const res = await rpc("hdc_not-a-real-token", "tools/list");
  expect(res.status).toBe(401);
});