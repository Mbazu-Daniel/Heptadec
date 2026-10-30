import { createServer, type Server } from "node:http";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { db, request, signUp, TEST_POSTGRES, uniqueEmail, uniqueSlug } from "./helpers";

const { dashboardDataSource, savedQuery, widget } = schema;

const REGION_COUNTS =
  "SELECT region, count(*)::int AS events FROM events GROUP BY region ORDER BY region";

async function ownerWithOrg(): Promise<{ cookie: string; orgId: string }> {
  const { cookie } = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Generated Org", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, orgId: org.id };
}

async function createSource(cookie: string, name: string): Promise<string> {
  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name,
      host: TEST_POSTGRES.host,
      port: TEST_POSTGRES.port,
      database: TEST_POSTGRES.database,
      username: TEST_POSTGRES.user,
      password: TEST_POSTGRES.password,
      readOnly: true,
    }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { dataSource: { id: string } }).dataSource.id;
}

async function saveQuery(
  cookie: string,
  sourceId: string,
  sql: string,
): Promise<string> {
  const res = await request(`/api/data-sources/${sourceId}/saved-queries`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Query", sql }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { savedQuery: { id: string } }).savedQuery.id;
}

async function createDashboard(
  cookie: string,
  name: string,
  dataSourceIds: string[],
): Promise<string> {
  const res = await request("/api/dashboards", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name, dataSourceIds }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { dashboard: { id: string } }).dashboard.id;
}

async function chartIt(
  cookie: string,
  dashboardId: string,
  savedQueryId: string,
): Promise<string> {
  const res = await request(`/api/dashboards/${dashboardId}/widgets`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      savedQueryId,
      chartType: "bar",
      title: "Events per region",
      labelColumn: "region",
      valueColumn: "events",
    }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { widget: { id: string } }).widget.id;
}

async function registerProvider(
  cookie: string,
  baseUrl: string,
): Promise<void> {
  const res = await request("/api/ai/providers", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      name: "laptop",
      provider: "openai-compatible",
      model: "m",
      baseUrl,
      apiKey: "sk-x",
    }),
  });
  expect(res.status).toBe(201);
}

async function startProvider(
  text: string,
): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server: Server = createServer((request, response) => {
    const incoming: Buffer[] = [];
    request.on("data", (chunk: Buffer) => incoming.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(incoming).toString()) as {
        stream?: boolean;
      };
      if (body.stream !== true) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            id: "1",
            object: "chat.completion",
            created: 1,
            model: "test",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: text },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 1,
              completion_tokens: 1,
              total_tokens: 2,
            },
          }),
        );
        return;
      }

      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      const size = 64;
      const parts: string[] = [];
      for (let i = 0; i < text.length; i += size) {
        parts.push(text.slice(i, i + size));
      }
      let index = 0;
      const push = (): void => {
        if (index >= parts.length) {
          response.write("data: [DONE]\n\n");
          response.end();
          return;
        }
        const content = parts[index]!;
        index += 1;
        response.write(
          `data: ${JSON.stringify({
            id: "1",
            object: "chat.completion.chunk",
            created: 1,
            model: "test",
            choices: [
              {
                index: 0,
                delta: { content },
                finish_reason: index >= parts.length ? "stop" : null,
              },
            ],
          })}\n\n`,
        );
        setImmediate(push);
      };
      push();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

function readDone<T>(text: string): T {
  const frame = text
    .split("\n\n")
    .find((entry) => entry.includes("event: done"));
  expect(frame).toBeDefined();
  const data = frame!
    .split("\n")
    .find((line) => line.startsWith("data:"))!;
  return JSON.parse(data.slice(5).trim()) as T;
}

it("stores the sources a dashboard is created from", async () => {
  const { cookie, orgId } = await ownerWithOrg();
  const first = await createSource(cookie, "Events");
  const second = await createSource(cookie, "Orders");

  const dashboardId = await createDashboard(cookie, "Two sources", [
    first,
    second,
  ]);

  const rows = await db
    .select()
    .from(dashboardDataSource)
    .where(eq(dashboardDataSource.dashboardId, dashboardId));

  expect(rows.map((row) => row.dataSourceId).sort()).toEqual(
    [first, second].sort(),
  );
  expect(rows.every((row) => row.organizationId === orgId)).toBe(true);
});

it("refuses a chart whose query belongs to a source the dashboard does not draw from", async () => {
  const { cookie } = await ownerWithOrg();
  const connected = await createSource(cookie, "Connected");
  const elsewhere = await createSource(cookie, "Elsewhere");

  const orphanQuery = await saveQuery(cookie, elsewhere, REGION_COUNTS);
  const dashboardId = await createDashboard(cookie, "Scoped", [connected]);

  const res = await request(`/api/dashboards/${dashboardId}/widgets`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      savedQueryId: orphanQuery,
      chartType: "bar",
      title: "Regions",
      labelColumn: "region",
      valueColumn: "events",
    }),
  });
  expect(res.status).toBe(400);

  const rows = await db
    .select()
    .from(widget)
    .where(eq(widget.dashboardId, dashboardId));
  expect(rows).toHaveLength(0);
});

it("drops the source links along with the dashboard", async () => {
  const { cookie } = await ownerWithOrg();
  const sourceId = await createSource(cookie, "Events");
  const dashboardId = await createDashboard(cookie, "Doomed", [sourceId]);

  const removed = await request(`/api/dashboards/${dashboardId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  expect(removed.status).toBe(200);

  const rows = await db
    .select()
    .from(dashboardDataSource)
    .where(eq(dashboardDataSource.dashboardId, dashboardId));
  expect(rows).toHaveLength(0);
});

it("plots the charts a provider drafts, and saves none of the ones that do not run", async () => {
  const { cookie, orgId } = await ownerWithOrg();
  const sourceId = await createSource(cookie, "Seeded events");

  const plan = JSON.stringify({
    summary: "Events by region",
    charts: [
      {
        sourceId,
        title: "Events per region",
        sql: REGION_COUNTS,
        chartType: "bar",
        labelColumn: "region",
        valueColumn: "events",
      },
      {
        sourceId,
        title: "Broken chart",
        sql: "SELECT nope FROM definitely_not_a_table",
        chartType: "pie",
        labelColumn: "nope",
        valueColumn: "nope",
      },
    ],
  });

  const provider = await startProvider(plan);
  try {
    await registerProvider(cookie, provider.baseUrl);

    const res = await request("/api/dashboards/generate", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "Generated", dataSourceIds: [sourceId] }),
    });
    expect(res.status).toBe(200);
    const { dashboard } = readDone<{ dashboard: { id: string } }>(
      await res.text(),
    );

    const queries = await db
      .select()
      .from(savedQuery)
      .where(eq(savedQuery.organizationId, orgId));
    expect(queries.map((row) => row.name)).toEqual(["Events per region"]);

    const rows = await db
      .select()
      .from(widget)
      .where(eq(widget.dashboardId, dashboard.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Events per region");
    expect(rows[0]!.labelColumn).toBe("region");
    expect(rows[0]!.valueColumn).toBe("events");
  } finally {
    await provider.close();
  }
});

it("proposes changes without applying them, then applies what is approved", async () => {
  const { cookie } = await ownerWithOrg();
  const sourceId = await createSource(cookie, "Seeded events");
  const existing = await saveQuery(cookie, sourceId, REGION_COUNTS);
  const dashboardId = await createDashboard(cookie, "Asking", [sourceId]);
  const existingWidgetId = await chartIt(cookie, dashboardId, existing);

  const proposal = JSON.stringify({
    summary: "Add a row count",
    actions: [
      {
        kind: "add",
        sourceId,
        title: "Total events",
        sql: "SELECT 'all' AS label, count(*)::int AS total FROM events",
        chartType: "pie",
        labelColumn: "label",
        valueColumn: "total",
      },
      { kind: "remove", widgetId: existingWidgetId },
    ],
  });

  const provider = await startProvider(proposal);
  try {
    await registerProvider(cookie, provider.baseUrl);

    const asked = await request(`/api/dashboards/${dashboardId}/ask`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ question: "how many events are there" }),
    });
    expect(asked.status).toBe(200);
    const body = readDone<{
      proposal: { actions: Array<{ kind: string }> };
    }>(await asked.text());
    expect(body.proposal.actions.map((action) => action.kind)).toEqual([
      "add",
      "remove",
    ]);

    const afterAsking = await db
      .select()
      .from(widget)
      .where(eq(widget.dashboardId, dashboardId));
    expect(afterAsking).toHaveLength(1);

    const applied = await request(`/api/dashboards/${dashboardId}/apply`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ actions: [body.proposal.actions[0]] }),
    });
    expect(applied.status).toBe(200);
    const result = (await applied.json()) as {
      applied: Array<{ problem: string | null }>;
    };
    expect(result.applied.map((entry) => entry.problem)).toEqual([null]);

    const afterApplying = await db
      .select()
      .from(widget)
      .where(eq(widget.dashboardId, dashboardId));
    expect(afterApplying.map((row) => row.title).sort()).toEqual([
      "Events per region",
      "Total events",
    ]);
  } finally {
    await provider.close();
  }
});
