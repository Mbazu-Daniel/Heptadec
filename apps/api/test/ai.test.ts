import { createServer, type Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import { expect, it } from "vitest";
import { db, schema } from "@heptadec/db";
import { auth } from "../src/common/config/better-auth";
import { app, signUp, uniqueEmail, uniqueSlug } from "./helpers";

const { aiProvider, aiChat, dataSource } = schema;

const TEST_POSTGRES = {
  host: "127.0.0.1",
  port: 5434,
  user: "heptadec",
  password: "heptadec",
  database: "heptadec_test",
};

interface ICaptured {
  url: string;
  auth: string | undefined;
  body: string;
}

async function startModelsProvider(
  models: Array<{ id: string; name: string }> | null,
  status = 200,
): Promise<{
  baseUrl: string;
  seenAuth: string | undefined;
  close: () => Promise<void>;
}> {
  let seenAuth: string | undefined;
  const server: Server = createServer((request, response) => {
    seenAuth = request.headers.authorization;
    if (models === null) {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "nope" } }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        object: "list",
        data: models.map((entry) => ({ ...entry, object: "model" })),
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    get seenAuth() {
      return seenAuth;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

async function startProvider(reply: string, chunks = 4): Promise<{
  baseUrl: string;
  captured: ICaptured[];
  close: () => Promise<void>;
}> {
  const captured: ICaptured[] = [];
  const server: Server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    request.on("end", () => {
      captured.push({
        url: request.url ?? "",
        auth: request.headers.authorization,
        body,
      });
      const streaming = JSON.parse(body || "{}").stream === true;

      if (!streaming) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            id: "1",
            object: "chat.completion",
            created: 1,
            model: "test",
            choices: [
              { index: 0, message: { role: "assistant", content: reply }, finish_reason: "stop" },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          }),
        );
        return;
      }

      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
      });
      const size = Math.max(1, Math.ceil(reply.length / chunks));
      const parts: string[] = [];
      for (let i = 0; i < reply.length; i += size) {
        parts.push(reply.slice(i, i + size));
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
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address !== null ? address.port : 0;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    captured,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    },
  };
}

interface IEvent {
  name: string;
  data: string;
}

async function ask(
  cookie: string,
  dataSourceId: string,
  question: string,
): Promise<{ events: IEvent[]; body: { sql: string | null; answered: boolean } }> {
  const res = await app.request("/api/ai/ask", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ dataSourceId, question }),
  });
  const text = await res.text();
  const events: IEvent[] = [];
  for (const frame of text.split("\n\n")) {
    let name = "message";
    const data: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) {
        name = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data.push(line.slice(5).trim());
      }
    }
    if (data.length > 0) {
      events.push({ name, data: data.join("\n") });
    }
  }
  const last = events.at(-1);
  if (last === undefined || last.name !== "done") {
    throw new Error(`stream ended without done: ${text.slice(0, 300)}`);
  }
  return { events, body: JSON.parse(last.data) as { sql: string | null; answered: boolean } };
}

async function ownerWithSource(): Promise<{
  cookie: string;
  sourceId: string;
  organizationId: string;
}> {
  const { cookie } = await signUp(uniqueEmail());
  const org = await auth.api.createOrganization({
    body: { name: "AI Org", slug: uniqueSlug() },
    headers: { cookie },
  });
  const created = await app.request("/api/data-sources", {
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
  expect(created.status).toBe(200);
  const id = ((await created.json()) as { dataSource: { id: string } }).dataSource.id;
  return { cookie, sourceId: id, organizationId: org.id };
}

function mineOf<T extends { organizationId: string }>(
  rows: T[],
  organizationId: string,
): T[] {
  return rows.filter((row) => row.organizationId === organizationId);
}

async function addProvider(
  cookie: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return app.request("/api/ai/providers", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

it("turns a question into a statement and logs the call", async () => {
  const provider = await startProvider(
    "SELECT region, count(*)::int AS events FROM events GROUP BY region",
  );
  try {
    const { cookie, sourceId, organizationId } = await ownerWithSource();
    const created = await addProvider(cookie, {
      name: "laptop",
      provider: "openai-compatible",
      model: "some-model",
      baseUrl: provider.baseUrl,
      apiKey: "sk-org-secret",
    });
    expect(created.status).toBe(201);

    const { events, body } = await ask(cookie, sourceId, "how many events per region?");
    expect(body.answered).toBe(true);
    expect(body.sql).toContain("SELECT region");

    expect(events[0]!.name).toBe("status");
    expect(events.at(-1)!.name).toBe("done");
    const deltas = events.filter((event) => event.name === "delta");
    expect(deltas.length).toBeGreaterThan(1);
    const streamed = deltas
      .map((event) => (JSON.parse(event.data) as { text: string }).text)
      .join("");
    expect(streamed).toBe(body.sql);
    expect(streamed).toContain("SELECT region");
    expect(JSON.parse(events.at(-1)!.data)).toMatchObject({
      providerName: "laptop",
    });

    expect(provider.captured).toHaveLength(1);
    expect(provider.captured[0]!.url).toBe("/v1/chat/completions");
    expect(provider.captured[0]!.auth).toBe("Bearer sk-org-secret");
    const sent = JSON.parse(provider.captured[0]!.body) as {
      messages: Array<{ content: string }>;
    };
    expect(sent.messages.at(-1)!.content).toContain("events");

    const rows = mineOf(await db.select().from(aiChat), organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sql).toContain("SELECT region");
    expect(rows[0]!.problem).toBeNull();
  } finally {
    await provider.close();
  }
});

it("never stores the key in the clear", async () => {
  const provider = await startProvider("SELECT 1");
  try {
    const { cookie, organizationId } = await ownerWithSource();
    await addProvider(cookie, {
      name: "team key",
      provider: "openai-compatible",
      model: "m",
      baseUrl: provider.baseUrl,
      apiKey: "sk-never-in-plaintext",
    });

    const rows = mineOf(await db.select().from(aiProvider), organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.apiKey).not.toContain("sk-never-in-plaintext");
    expect(rows[0]!.apiKey.startsWith("v1:")).toBe(true);

    const listed = await app.request("/api/ai/providers", { headers: { cookie } });
    const text = await listed.text();
    expect(text).not.toContain("sk-never-in-plaintext");
  } finally {
    await provider.close();
  }
});

it("keeps one organization's keys and providers out of another's reach", async () => {
  const provider = await startProvider("SELECT 1");
  try {
    const mine = await ownerWithSource();
    const theirs = await ownerWithSource();
    await addProvider(mine.cookie, {
      name: "mine",
      provider: "openai-compatible",
      model: "m",
      baseUrl: provider.baseUrl,
      apiKey: "sk-mine",
    });
    await addProvider(theirs.cookie, {
      name: "theirs",
      provider: "openai-compatible",
      model: "m",
      baseUrl: provider.baseUrl,
      apiKey: "sk-theirs",
    });

    const mineList = (await (
      await app.request("/api/ai/providers", { headers: { cookie: mine.cookie } })
    ).json()) as { providers: Array<{ name: string }> };
    expect(mineList.providers.map((p) => p.name)).toEqual(["mine"]);

    const theirList = (await (
      await app.request("/api/ai/providers", { headers: { cookie: theirs.cookie } })
    ).json()) as { providers: Array<{ name: string }> };
    expect(theirList.providers.map((p) => p.name)).toEqual(["theirs"]);

    const rows = await db
      .select()
      .from(aiProvider)
      .where(
        inArray(aiProvider.organizationId, [
          mine.organizationId,
          theirs.organizationId,
        ]),
      );
    expect(rows).toHaveLength(2);
    const mineRow = rows.find((r) => r.name === "mine")!;
    const theirRow = rows.find((r) => r.name === "theirs")!;

    const stolen = await app.request(`/api/ai/providers/${theirRow.id}`, {
      method: "DELETE",
      headers: { cookie: mine.cookie },
    });
    expect(stolen.status).toBe(404);
    const stillThere = await db
      .select()
      .from(aiProvider)
      .where(eq(aiProvider.id, theirRow.id));
    expect(stillThere).toHaveLength(1);
    expect(mineRow.organizationId).not.toBe(theirRow.organizationId);
  } finally {
    await provider.close();
  }
});

it("refuses to ask before a provider exists", async () => {
  const { cookie, sourceId } = await ownerWithSource();
  const res = await app.request("/api/ai/ask", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ dataSourceId: sourceId, question: "anything?" }),
  });
  expect(res.status).toBe(400);
  expect(await res.text()).toContain("No AI provider");
});

it("uses the provider the user marked as default", async () => {
  const first = await startProvider("SELECT 'first'");
  const second = await startProvider("SELECT 'second'");
  try {
    const { cookie, sourceId } = await ownerWithSource();
    await addProvider(cookie, {
      name: "a",
      provider: "openai-compatible",
      model: "m",
      baseUrl: first.baseUrl,
      apiKey: "sk-a",
    });
    await addProvider(cookie, {
      name: "b",
      provider: "openai-compatible",
      model: "m",
      baseUrl: second.baseUrl,
      apiKey: "sk-b",
      isDefault: true,
    });

    const { body } = await ask(cookie, sourceId, "pick one");
    expect(body.sql).toContain("second");
    expect(first.captured).toHaveLength(0);
    expect(second.captured).toHaveLength(1);
  } finally {
    await first.close();
    await second.close();
  }
});

it("says so when the model declines to answer", async () => {
  const provider = await startProvider("UNANSWERABLE");
  try {
    const { cookie, sourceId, organizationId } = await ownerWithSource();
    await addProvider(cookie, {
      name: "laptop",
      provider: "openai-compatible",
      model: "m",
      baseUrl: provider.baseUrl,
      apiKey: "sk-x",
    });

    const { events, body } = await ask(
      cookie,
      sourceId,
      "what is the airspeed of a swallow",
    );
    expect(body.answered).toBe(false);
    expect(body.sql).toBeNull();
    expect(events.some((event) => event.name === "problem")).toBe(true);

    const rows = mineOf(await db.select().from(aiChat), organizationId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sql).toBeNull();
  } finally {
    await provider.close();
  }
});

it("logs the failure without echoing the key when the provider is down", { timeout: 30_000 }, async () => {
  const { cookie, sourceId, organizationId } = await ownerWithSource();
  await addProvider(cookie, {
    name: "dead",
    provider: "openai-compatible",
    model: "m",
    baseUrl: "http://127.0.0.1:45999/v1",
    apiKey: "sk-dead-secret",
  });

  const { events, body } = await ask(cookie, sourceId, "anything");
  expect(body.sql).toBeNull();
  const problem = events.find((event) => event.name === "problem");
  expect(problem).toBeDefined();
  expect(problem!.data).not.toContain("could not be answered from this schema");
  expect(JSON.stringify(events)).not.toContain("sk-dead-secret");

  const rows = mineOf(await db.select().from(aiChat), organizationId);
  expect(rows).toHaveLength(1);
  expect(rows[0]!.problem).toMatch(/key|reached/);
  expect(rows[0]!.problem).not.toContain("could not be answered from this schema");
  expect(rows[0]!.sql).toBeNull();
});

it("refuses a provider that is not in the catalog", async () => {
  const { cookie } = await ownerWithSource();
  const res = await addProvider(cookie, {
    name: "made up",
    provider: "not-a-real-provider",
    model: "m",
    apiKey: "sk-x",
  });
  expect(res.status).toBe(400);
});

it("offers Groq in the catalog as a ready choice", async () => {
  const { cookie } = await ownerWithSource();
  const res = await app.request("/api/ai/providers", { headers: { cookie } });
  const body = (await res.json()) as {
    catalog: Array<{
      id: string;
      label: string;
      baseUrl: string;
      needsBaseUrl: boolean;
    }>;
  };
  const groq = body.catalog.find((entry) => entry.id === "groq");
  expect(groq).toBeDefined();
  expect(groq!.baseUrl).toBe("https://api.groq.com/openai/v1");
  expect(body.catalog.some((entry) => entry.needsBaseUrl)).toBe(true);
  expect(JSON.stringify(body.catalog)).not.toContain("llama-3.3-70b-versatile");
});

it("keeps providers away from anyone who is not an owner", async () => {
  const { cookie, organizationId: orgId } = await ownerWithSource();
  const editor = await signUp(uniqueEmail());
  await auth.api.addMember({
    body: { userId: editor.user.id, role: "editor", organizationId: orgId },
    headers: { cookie },
  });
  await auth.api.setActiveOrganization({
    body: { organizationId: orgId },
    headers: { cookie: editor.cookie },
  });

  const res = await app.request("/api/ai/providers", { headers: { cookie: editor.cookie } });
  expect(res.status).toBe(403);
});

it("lists the models the provider actually serves, not a shipped list", async () => {
  const provider = await startModelsProvider([
    { id: "openai/gpt-oss-120b", name: "GPT OSS 120B" },
    { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B" },
  ]);
  try {
    const { cookie } = await ownerWithSource();
    const created = await addProvider(cookie, {
      name: "live",
      provider: "openai-compatible",
      model: "openai/gpt-oss-120b",
      baseUrl: provider.baseUrl,
      apiKey: "sk-models",
    });
    expect(created.status).toBe(201);
    const id = ((await created.json()) as { id: string }).id;

    const res = await app.request(`/api/ai/providers/${id}/models`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      source: string;
      models: Array<{ id: string; label: string | null }>;
    };
    expect(body.source).toBe("provider");
    expect(body.models.map((entry) => entry.id)).toEqual([
      "openai/gpt-oss-120b",
      "qwen/qwen3.8-27b",
    ]);
    expect(body.models[0]!.label).toBe("GPT OSS 120B");
    expect(provider.seenAuth).toBe("Bearer sk-models");
  } finally {
    await provider.close();
  }
});

it("falls back to what the organization already uses when a provider lists nothing", async () => {
  const provider = await startModelsProvider(null);
  try {
    const { cookie } = await ownerWithSource();
    const first = await addProvider(cookie, {
      name: "a",
      provider: "openai-compatible",
      model: "model-the-org-uses",
      baseUrl: provider.baseUrl,
      apiKey: "sk-x",
    });
    await addProvider(cookie, {
      name: "b",
      provider: "openai-compatible",
      model: "another-model",
      baseUrl: provider.baseUrl,
      apiKey: "sk-y",
    });
    const id = ((await first.json()) as { id: string }).id;

    const res = await app.request(`/api/ai/providers/${id}/models`, {
      headers: { cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      source: string;
      models: Array<{ id: string }>;
    };
    expect(body.source).toBe("suggestions");
    expect(body.models.map((entry) => entry.id).sort()).toEqual([
      "another-model",
      "model-the-org-uses",
    ]);
  } finally {
    await provider.close();
  }
});

it("says the key was refused rather than listing nothing", async () => {
  const provider = await startModelsProvider(null, 401);
  try {
    const { cookie } = await ownerWithSource();
    const created = await addProvider(cookie, {
      name: "bad key",
      provider: "openai-compatible",
      model: "m",
      baseUrl: provider.baseUrl,
      apiKey: "sk-wrong",
    });
    const id = ((await created.json()) as { id: string }).id;

    const res = await app.request(`/api/ai/providers/${id}/models`, {
      headers: { cookie },
    });
    expect(res.status).toBe(400);
    expect(await res.text()).toContain("refused");
  } finally {
    await provider.close();
  }
});

it("keeps one organization's model list out of another's reach", async () => {
  const provider = await startModelsProvider([{ id: "m", name: "m" }]);
  try {
    const mine = await ownerWithSource();
    const theirs = await ownerWithSource();
    const created = await addProvider(theirs.cookie, {
      name: "theirs",
      provider: "openai-compatible",
      model: "m",
      baseUrl: provider.baseUrl,
      apiKey: "sk-theirs",
    });
    const id = ((await created.json()) as { id: string }).id;

    const res = await app.request(`/api/ai/providers/${id}/models`, {
      headers: { cookie: mine.cookie },
    });
    expect(res.status).toBe(404);
  } finally {
    await provider.close();
  }
});

it("prunes a huge schema to a budget instead of sending all of it", async () => {
  const provider = await startProvider("SELECT 1");
  try {
    const { cookie, sourceId } = await ownerWithSource();
    await addProvider(cookie, {
      name: "laptop",
      provider: "openai-compatible",
      model: "m",
      baseUrl: provider.baseUrl,
      apiKey: "sk-x",
    });

    await ask(cookie, sourceId, "anything");

    const sent = JSON.parse(provider.captured[0]!.body) as {
      messages: Array<{ content: string }>;
    };
    const prompt = sent.messages.at(-1)!.content;
    expect(prompt.length).toBeLessThan(20_000);
    expect(prompt).toContain("events");
  } finally {
    await provider.close();
  }
});
