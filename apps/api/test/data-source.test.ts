import { and, desc, eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { decryptSecret } from "../src/modules/data-source/secret";
import { db, request, signUp, TEST_POSTGRES_PORT, uniqueEmail, uniqueSlug } from "./helpers";

const { auditLog, dataSource } = schema;

async function ownerWithOrganization(): Promise<{
  cookie: string;
  organizationId: string;
}> {
  const { cookie } = await signUp(uniqueEmail());
  const created = await authFor(db).api.createOrganization({
    body: { name: "Source Org", slug: uniqueSlug() },
    headers: { cookie },
  });
  return { cookie, organizationId: created.id };
}

function postgresInput(name: string) {
  return {
    kind: "postgres",
    name,
    host: "db.internal",
    port: 5432,
    database: "warehouse",
    username: "readonly_svc",
    password: "s3cret-password",
  };
}

it("stores a postgres source with its secret encrypted", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(postgresInput("Production replica")),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    organizationId,
    kind: "postgres",
    name: "Production replica",
    host: "db.internal",
    port: 5432,
    database: "warehouse",
    username: "readonly_svc",
    readOnly: false,
  });
  expect(rows[0]!.secret).not.toBeNull();
  expect(rows[0]!.secret).not.toContain("s3cret-password");
  expect(rows[0]!.secret!.startsWith("v1:")).toBe(true);
  expect(await decryptSecret(rows[0]!.secret!)).toBe("s3cret-password");

  const body = (await res.json()) as {
    dataSource: { id: string; hasSecret: boolean };
  };
  expect(body.dataSource.id).toBe(rows[0]!.id);
  expect(body.dataSource.hasSecret).toBe(true);
  expect(JSON.stringify(body)).not.toContain("s3cret-password");
});

it("stores a redis source without a secret when no password is sent", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "redis",
      name: "Session cache",
      host: "cache.internal",
    }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: "redis",
    port: 6379,
    secret: null,
  });
});

it("lists only the sources of the active organization", async () => {
  const first = await ownerWithOrganization();
  const second = await ownerWithOrganization();

  await request("/api/data-sources", {
    method: "POST",
    headers: { cookie: first.cookie, "content-type": "application/json" },
    body: JSON.stringify(postgresInput("First source")),
  });
  await request("/api/data-sources", {
    method: "POST",
    headers: { cookie: second.cookie, "content-type": "application/json" },
    body: JSON.stringify(postgresInput("Second source")),
  });

  const res = await request("/api/data-sources", {
    headers: { cookie: first.cookie },
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    dataSources: { id: string; organizationId: string; name: string }[];
  };
  expect(body.dataSources).toHaveLength(1);
  expect(body.dataSources[0]).toMatchObject({
    organizationId: first.organizationId,
    name: "First source",
  });
});

it("returns 404 and keeps the row when deleting another organization's source", async () => {
  const mine = await ownerWithOrganization();
  const theirs = await ownerWithOrganization();

  const created = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie: theirs.cookie, "content-type": "application/json" },
    body: JSON.stringify(postgresInput("Their source")),
  });
  const createdId = (
    (await created.json()) as { dataSource: { id: string } }
  ).dataSource.id;

  const res = await request(`/api/data-sources/${createdId}`, {
    method: "DELETE",
    headers: { cookie: mine.cookie },
  });
  expect(res.status).toBe(404);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, theirs.organizationId));
  expect(rows).toHaveLength(1);
  expect(rows[0]!.id).toBe(createdId);
});

it("refuses a create from a viewer and writes nothing", async () => {
  const { organizationId } = await ownerWithOrganization();
  const { user: viewer, cookie: viewerCookie } = await signUp(uniqueEmail());

  await authFor(db).api.addMember({
    body: { userId: viewer.id, role: "viewer", organizationId },
  });
  await request("/api/organization/switch", {
    method: "POST",
    headers: { cookie: viewerCookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId }),
  });

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie: viewerCookie, "content-type": "application/json" },
    body: JSON.stringify(postgresInput("Viewer source")),
  });
  expect(res.status).toBe(403);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("rejects an unknown engine and writes nothing", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ ...postgresInput("Bad engine"), kind: "oracle" }),
  });
  expect(res.status).toBe(400);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("rejects a quickwit endpoint that is not a URL and writes nothing", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "quickwit",
      name: "Logs",
      host: "not-a-url",
    }),
  });
  expect(res.status).toBe(400);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("stores a quickwit source keyed by its endpoint URL", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "quickwit",
      name: "App logs",
      endpoint: "https://search.internal:7280",
      database: "app-logs",
    }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: "quickwit",
    host: "https://search.internal:7280",
    port: null,
    database: "app-logs",
  });
});

it("stores a mysql source with its own default port", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "mysql",
      name: "Shop database",
      host: "db.internal",
      database: "shop",
      username: "readonly_svc",
    }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: "mysql",
    host: "db.internal",
    port: 3306,
    database: "shop",
    username: "readonly_svc",
    secret: null,
  });
});

it("stores a sqlite source keyed by its file path", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "sqlite",
      name: "Local analytics",
      filePath: "/data/analytics.db",
    }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: "sqlite",
    host: null,
    port: null,
    database: "/data/analytics.db",
    username: null,
    secret: null,
  });
});

it("reads a pasted connection URL into the columns a filled form would write", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "From a URL",
      connectionUrl:
        "postgresql://readonly_svc:s3cret%20password@db.internal:6543/warehouse",
    }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  const row = rows[0]!;
  expect(row.host).toBe("db.internal");
  expect(row.port).toBe(6543);
  expect(row.database).toBe("warehouse");
  expect(row.username).toBe("readonly_svc");
  expect(await decryptSecret(row.secret!)).toBe("s3cret password");
  expect(row.connectionMode).toBe("tcp");
});

it("takes the connection mode from the scheme of a pasted URL", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "redis",
      name: "TLS cache",
      connectionUrl: "rediss://cache.internal:6380/3",
    }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  const row = rows[0]!;
  expect(row.connectionMode).toBe("tls");
  expect(row.host).toBe("cache.internal");
  expect(row.port).toBe(6380);
  expect(row.database).toBe("3");
});

it("refuses a URL in a scheme the engine does not speak and writes nothing", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Wrong scheme",
      connectionUrl: "mysql://db.internal/warehouse",
    }),
  });
  expect(res.status).toBe(400);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("refuses a URL for an engine that cannot take one and writes nothing", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "sqlite",
      name: "File with a URL",
      connectionUrl: "sqlite:///data/analytics.db",
    }),
  });
  expect(res.status).toBe(400);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("refuses a host filled in beside a pasted URL rather than picking one", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Both ways",
      connectionUrl: "postgres://db.internal/warehouse",
      host: "somewhere.else",
    }),
  });
  expect(res.status).toBe(400);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("refuses a connection URL it cannot read and writes nothing", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Not a URL",
      connectionUrl: "db.internal:5432/warehouse",
    }),
  });
  expect(res.status).toBe(400);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("stores a TLS source with every certificate encrypted and none of them returned", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      ...postgresInput("TLS replica"),
      connectionMode: "tls",
      caCert: "CA-CERTIFICATE-MATERIAL",
      clientCert: "CLIENT-CERTIFICATE-MATERIAL",
      clientKey: "CLIENT-KEY-MATERIAL",
    }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(1);

  const row = rows[0]!;
  expect(row.connectionMode).toBe("tls");
  expect(row.caCertificate!.startsWith("v1:")).toBe(true);
  expect(row.clientCertificate!.startsWith("v1:")).toBe(true);
  expect(row.clientKey!.startsWith("v1:")).toBe(true);
  expect(await decryptSecret(row.caCertificate!)).toBe("CA-CERTIFICATE-MATERIAL");
  expect(await decryptSecret(row.clientKey!)).toBe("CLIENT-KEY-MATERIAL");

  const text = await res.text();
  expect(text).not.toContain("CA-CERTIFICATE-MATERIAL");
  expect(text).not.toContain("CLIENT-CERTIFICATE-MATERIAL");
  expect(text).not.toContain("CLIENT-KEY-MATERIAL");

  const body = JSON.parse(text) as {
    dataSource: {
      connectionMode: string;
      hasCaCert: boolean;
      hasClientCert: boolean;
      hasClientKey: boolean;
    };
  };
  expect(body.dataSource.connectionMode).toBe("tls");
  expect(body.dataSource.hasCaCert).toBe(true);
  expect(body.dataSource.hasClientCert).toBe(true);
  expect(body.dataSource.hasClientKey).toBe(true);
});

it("stores a socket source with its path and no host to fall back on", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Local socket",
      connectionMode: "socket",
      socketPath: "/var/run/postgresql/.s.PGSQL.5432",
      database: "warehouse",
      username: "readonly_svc",
    }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  const row = rows[0]!;
  expect(row.connectionMode).toBe("socket");
  expect(row.socketPath).toBe("/var/run/postgresql/.s.PGSQL.5432");
  expect(row.host).toBeNull();
  expect(row.port).toBeNull();
});

it("rejects a host on a socket source rather than ignoring it", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Half filled",
      connectionMode: "socket",
      socketPath: "/var/run/postgresql/.s.PGSQL.5432",
      host: "db.internal",
      database: "warehouse",
      username: "readonly_svc",
    }),
  });
  expect(res.status).toBe(400);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("rejects a certificate outside TLS mode and writes nothing", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      ...postgresInput("Plain with a cert"),
      caCert: "CA-CERTIFICATE-MATERIAL",
    }),
  });
  expect(res.status).toBe(400);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("stores the schema the structure reader should look in", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ ...postgresInput("Sales"), schema: "sales" }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows[0]!.schemaName).toBe("sales");
});

it("rejects an unknown connection mode and writes nothing", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      ...postgresInput("Odd mode"),
      connectionMode: "carrier-pigeon",
    }),
  });
  expect(res.status).toBe(400);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("rejects a sqlite source carrying server fields and writes nothing", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "sqlite",
      name: "Local analytics",
      filePath: "/data/analytics.db",
      host: "db.internal",
    }),
  });
  expect(res.status).toBe(400);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("stores a clickhouse source with its own default port", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "clickhouse",
      name: "Events OLAP",
      host: "analytics.internal",
      database: "heptadec_test",
    }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: "clickhouse",
    host: "analytics.internal",
    port: 8123,
    database: "heptadec_test",
    secret: null,
  });
});

it("stores a libsql source keyed by its endpoint URL", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "libsql",
      name: "Edge replica",
      endpoint: "http://edge.internal:8080",
    }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: "libsql",
    host: "http://edge.internal:8080",
    port: null,
  });
});

it("rejects a libsql endpoint that is not a URL and writes nothing", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "libsql",
      name: "Edge replica",
      host: "edge.internal:8080",
    }),
  });
  expect(res.status).toBe(400);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("stores a mariadb source with its own default port", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "mariadb",
      name: "Shop replica",
      host: "db.internal",
      database: "shop",
      username: "readonly_svc",
    }),
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    kind: "mariadb",
    host: "db.internal",
    port: 3306,
    database: "shop",
    username: "readonly_svc",
    secret: null,
  });
});

it("tests a connection without writing anything", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources/test", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Connection test",
      host: "127.0.0.1",
      port: TEST_POSTGRES_PORT,
      database: "heptadec_test",
      username: "heptadec",
      password: "heptadec",
    }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    ok: boolean;
    total: number;
    sample: string[];
  };
  expect(body.ok).toBe(true);
  expect(body.total).toBeGreaterThan(0);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("answers 502 when the database cannot be reached", async () => {
  const { cookie } = await ownerWithOrganization();

  const res = await request("/api/data-sources/test", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      kind: "postgres",
      name: "Nowhere",
      host: "127.0.0.1",
      port: 1,
      database: "heptadec_test",
      username: "heptadec",
      password: "heptadec",
    }),
  });
  expect(res.status).toBe(502);
  const body = (await res.json()) as { error: { code: string } };
  expect(body.error.code).toBe("bad_gateway");
});

it("deletes its own source and the row is gone", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const created = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(postgresInput("Temporary source")),
  });
  const createdId = (
    (await created.json()) as { dataSource: { id: string } }
  ).dataSource.id;

  const res = await request(`/api/data-sources/${createdId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  expect(res.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

it("defaults a new source to fully writable and stores read-only when asked", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const plain = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(postgresInput("Writable replica")),
  });
  expect(plain.status).toBe(200);

  const restricted = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      ...postgresInput("Reporting replica"),
      readOnly: true,
    }),
  });
  expect(restricted.status).toBe(200);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId))
    .orderBy(dataSource.name);
  expect(rows).toHaveLength(2);

  const writable = rows.find((row) => row.name === "Writable replica")!;
  const readOnlyRow = rows.find((row) => row.name === "Reporting replica")!;
  expect(writable.readOnly).toBe(false);
  expect(readOnlyRow.readOnly).toBe(true);
});

it("refuses a non-boolean readOnly and writes nothing", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();

  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      ...postgresInput("Bad flag"),
      readOnly: "yes please",
    }),
  });
  expect(res.status).toBe(400);

  const rows = await db
    .select()
    .from(dataSource)
    .where(eq(dataSource.organizationId, organizationId));
  expect(rows).toHaveLength(0);
});

async function createdSource(
  cookie: string,
  input: Record<string, unknown>,
): Promise<string> {
  const res = await request("/api/data-sources", {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { dataSource: { id: string } }).dataSource.id;
}

async function rowOf(organizationId: string, id: string) {
  const rows = await db
    .select()
    .from(dataSource)
    .where(
      and(
        eq(dataSource.id, id),
        eq(dataSource.organizationId, organizationId),
      ),
    );
  return rows[0]!;
}

it("renames a source and leaves every other column and the secret alone", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const id = await createdSource(cookie, postgresInput("Old name"));

  const res = await request(`/api/data-sources/${id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "New name" }),
  });
  expect(res.status).toBe(200);

  const row = await rowOf(organizationId, id);
  expect(row.name).toBe("New name");
  expect(row.host).toBe("db.internal");
  expect(row.port).toBe(5432);
  expect(row.database).toBe("warehouse");
  expect(row.username).toBe("readonly_svc");
  expect(row.readOnly).toBe(false);
  // The secret is never sent back, so it can only have been kept.
  expect(await decryptSecret(row.secret!)).toBe("s3cret-password");
});

it("replaces a secret only when a new one is sent", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const id = await createdSource(cookie, postgresInput("Rotated"));

  const res = await request(`/api/data-sources/${id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Rotated", password: "rotated-password" }),
  });
  expect(res.status).toBe(200);

  const row = await rowOf(organizationId, id);
  expect(await decryptSecret(row.secret!)).toBe("rotated-password");
});

it("keeps the engine the source already has when a different one is sent", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const id = await createdSource(cookie, postgresInput("Not mysql"));

  const res = await request(`/api/data-sources/${id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Still postgres", kind: "mysql" }),
  });
  expect(res.status).toBe(200);

  const body = (await res.json()) as { dataSource: { kind: string } };
  expect(body.dataSource.kind).toBe("postgres");

  const row = await rowOf(organizationId, id);
  expect(row.kind).toBe("postgres");
});

it("keeps a socket source on its socket when the restatement names neither", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const id = await createdSource(cookie, {
    kind: "postgres",
    name: "Local socket",
    connectionMode: "socket",
    socketPath: "/var/run/postgresql/.s.PGSQL.5432",
    database: "warehouse",
    username: "readonly_svc",
  });

  const res = await request(`/api/data-sources/${id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Local socket, renamed" }),
  });
  expect(res.status).toBe(200);

  const row = await rowOf(organizationId, id);
  expect(row.connectionMode).toBe("socket");
  expect(row.socketPath).toBe("/var/run/postgresql/.s.PGSQL.5432");
  expect(row.host).toBeNull();
  expect(row.port).toBeNull();
});

it("drops the host when a source moves from tcp to a socket", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const id = await createdSource(cookie, postgresInput("Moving"));

  const res = await request(`/api/data-sources/${id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Moving",
      connectionMode: "socket",
      socketPath: "/var/run/postgresql/.s.PGSQL.5432",
    }),
  });
  expect(res.status).toBe(200);

  const row = await rowOf(organizationId, id);
  expect(row.connectionMode).toBe("socket");
  expect(row.host).toBeNull();
  expect(row.port).toBeNull();
  expect(row.socketPath).toBe("/var/run/postgresql/.s.PGSQL.5432");
});

it("keeps a TLS source's stored certificates when they are not sent back", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const id = await createdSource(cookie, {
    ...postgresInput("TLS replica"),
    connectionMode: "tls",
    caCert: "CA-CERTIFICATE-MATERIAL",
    clientCert: "CLIENT-CERTIFICATE-MATERIAL",
    clientKey: "CLIENT-KEY-MATERIAL",
  });

  const res = await request(`/api/data-sources/${id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "TLS replica, renamed" }),
  });
  expect(res.status).toBe(200);

  const row = await rowOf(organizationId, id);
  // Moving off TLS drops them; staying on TLS keeps them.
  expect(row.connectionMode).toBe("tls");
  expect(await decryptSecret(row.caCertificate!)).toBe("CA-CERTIFICATE-MATERIAL");
  expect(await decryptSecret(row.clientCertificate!)).toBe(
    "CLIENT-CERTIFICATE-MATERIAL",
  );
  expect(await decryptSecret(row.clientKey!)).toBe("CLIENT-KEY-MATERIAL");
});

it("keeps a stored certificate when a source moves off TLS", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const id = await createdSource(cookie, {
    ...postgresInput("TLS leaving"),
    connectionMode: "tls",
    caCert: "CA-CERTIFICATE-MATERIAL",
  });

  const res = await request(`/api/data-sources/${id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "TLS leaving", connectionMode: "tcp" }),
  });
  expect(res.status).toBe(200);

  const row = await rowOf(organizationId, id);
  expect(row.connectionMode).toBe("tcp");
  expect(row.host).toBe("db.internal");
  // A certificate is never shown back, so it is kept rather than destroyed
  // silently: moving back to TLS works without asking for it again.
  expect(await decryptSecret(row.caCertificate!)).toBe("CA-CERTIFICATE-MATERIAL");
});

it("refuses an update that would empty a required field and writes nothing", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const id = await createdSource(cookie, postgresInput("Keep the host"));

  const res = await request(`/api/data-sources/${id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Keep the host", host: "" }),
  });
  expect(res.status).toBe(400);

  const row = await rowOf(organizationId, id);
  expect(row.host).toBe("db.internal");
});

it("refuses an update carrying a field the engine does not have", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const id = await createdSource(cookie, {
    kind: "sqlite",
    name: "Local analytics",
    filePath: "/data/analytics.db",
  });

  const res = await request(`/api/data-sources/${id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Local analytics", socketPath: "/tmp/sock" }),
  });
  expect(res.status).toBe(400);

  const row = await rowOf(organizationId, id);
  expect(row.socketPath).toBeNull();
});

it("refuses an update from a viewer and writes nothing", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const id = await createdSource(cookie, postgresInput("Editorial eye"));
  const { user: viewer, cookie: viewerCookie } = await signUp(uniqueEmail());

  await authFor(db).api.addMember({
    body: { userId: viewer.id, role: "viewer", organizationId },
  });
  await request("/api/organization/switch", {
    method: "POST",
    headers: { cookie: viewerCookie, "content-type": "application/json" },
    body: JSON.stringify({ organizationId }),
  });

  const res = await request(`/api/data-sources/${id}`, {
    method: "PATCH",
    headers: { cookie: viewerCookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Viewer tried" }),
  });
  expect(res.status).toBe(403);

  const row = await rowOf(organizationId, id);
  expect(row.name).toBe("Editorial eye");
});

it("returns 404 and keeps the row when updating another organization's source", async () => {
  const mine = await ownerWithOrganization();
  const theirs = await ownerWithOrganization();

  const id = await createdSource(
    theirs.cookie,
    postgresInput("Their source"),
  );

  const res = await request(`/api/data-sources/${id}`, {
    method: "PATCH",
    headers: { cookie: mine.cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Taken over" }),
  });
  expect(res.status).toBe(404);

  const row = await rowOf(theirs.organizationId, id);
  expect(row.name).toBe("Their source");
});

it("records an audit entry naming the member who changed a source", async () => {
  const { cookie, organizationId } = await ownerWithOrganization();
  const id = await createdSource(cookie, postgresInput("Audited"));

  await request(`/api/data-sources/${id}`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: "Audited, renamed" }),
  });

  const entries = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.organizationId, organizationId))
    .orderBy(desc(auditLog.occurredAt));
  const updated = entries.find((entry) => entry.event === "data_source.updated");
  expect(updated).toBeDefined();
  expect(updated!.targetId).toBe(id);
  expect(updated!.targetLabel).toBe("Audited, renamed");
  expect(updated!.actorId).not.toBe("");
  expect(updated!.actorLabel).not.toBe("");
});
