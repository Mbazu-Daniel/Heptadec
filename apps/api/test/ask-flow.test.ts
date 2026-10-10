import { createServer, type Server } from "node:http";
import { expect, it } from "vitest";
import { auth } from "../src/common/config/better-auth";
import { app, signUp, uniqueEmail, uniqueSlug } from "./helpers";

const TEST_POSTGRES = {
  host: "127.0.0.1",
  port: 5434,
  user: "heptadec",
  password: "heptadec",
  database: "heptadec_test",
};

const WRITE_SQL =
  "DELETE FROM events WHERE region = 'eu'";

async function startProvider(): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server: Server = createServer((_request, response) => {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    });
    const size = 8;
    const parts: string[] = [];
    for (let i = 0; i < WRITE_SQL.length; i += size) {
      parts.push(WRITE_SQL.slice(i, i + size));
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
          choices: [{ index: 0, delta: { content }, finish_reason: null }],
        })}\n\n`,
      );
      setImmediate(push);
    };
    push();
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

it("hands back a draft for review and never runs it", async () => {
  const provider = await startProvider();
  try {
    const { cookie } = await signUp(uniqueEmail());
    await auth.api.createOrganization({
      body: { name: "Ask Org", slug: uniqueSlug() },
      headers: { cookie },
    });
    const source = await app.request("/api/data-sources", {
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
        readOnly: true,
      }),
    });
    const sourceId = ((await source.json()) as { dataSource: { id: string } })
      .dataSource.id;

    await app.request("/api/ai/providers", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        name: "laptop",
        provider: "openai-compatible",
        model: "m",
        baseUrl: provider.baseUrl,
        apiKey: "sk-x",
      }),
    });

    const asked = await app.request("/api/ai/ask", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        dataSourceId: sourceId,
        question: "remove the european events",
      }),
    });
    expect(asked.status).toBe(200);
    const text = await asked.text();
    const doneFrame = text
      .split("\n\n")
      .find((frame) => frame.includes("event: done"));
    expect(doneFrame).toBeDefined();
    const dataLine = doneFrame!.split("\n").find((line) => line.startsWith("data:"))!;
    const body = JSON.parse(dataLine.slice(5).trim()) as { sql: string };
    expect(body.sql).toBe(WRITE_SQL);
    expect(text).toContain("event: delta");

    const { default: pg } = await import("pg");
    const client = new pg.Client(TEST_POSTGRES);
    await client.connect();
    const before = await client.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM events",
    );
    await client.end();
    expect(before.rows[0]!.n).toBeGreaterThan(0);
  } finally {
    await provider.close();
  }
});

it("refuses the draft when the user does run it against a read-only source", async () => {
  const provider = await startProvider();
  try {
    const { cookie } = await signUp(uniqueEmail());
    await auth.api.createOrganization({
      body: { name: "Ask Org 2", slug: uniqueSlug() },
      headers: { cookie },
    });
    const source = await app.request("/api/data-sources", {
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
        readOnly: true,
      }),
    });
    const sourceId = ((await source.json()) as { dataSource: { id: string } })
      .dataSource.id;

    const ran = await app.request(`/api/data-sources/${sourceId}/query`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ sql: WRITE_SQL }),
    });
    expect(ran.status).toBe(400);
    expect(await ran.text()).toContain("read-only");
  } finally {
    await provider.close();
  }
});
