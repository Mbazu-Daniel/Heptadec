#!/usr/bin/env node

import { execFileSync } from "node:child_process";

const HOST = "127.0.0.1";
const PG = { user: "heptadec", password: "Delta1force", database: "heptadec_test" };

const SERVICES = [
  "api",
  "worker",
  "scheduler",
  "ingestion",
  "notifications",
  "ai",
];
const ENVIRONMENTS = ["production", "staging", "development"];
const REGIONS = ["eu-west-1", "us-east-1", "ap-south-1"];
const PATHS = [
  "GET /health",
  "GET /api/v1/projects",
  "POST /api/v1/telemetry",
  "GET /api/v1/dashboards",
  "POST /api/v1/traces",
  "GET /api/v1/services",
  "POST /api/v1/auth/session",
  "GET /api/v1/alerts",
];
const OPERATIONS = [
  "ingest.batch",
  "query.execute",
  "alert.evaluate",
  "notify.send",
  "trace.ingest",
  "session.refresh",
];

const LOG_COUNT = 1200;
const REQUEST_COUNT = 600;
const TRACE_COUNT = 200;
const SPANS_PER_TRACE = 5;

let seed = 0x5eed1eaf;
function next() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
function pick(list) {
  return list[Math.floor(next() * list.length) % list.length];
}
function hex(length) {
  let out = "";
  while (out.length < length) {
    out += Math.floor(next() * 0x10000).toString(16).padStart(4, "0");
  }
  return out.slice(0, length);
}

const END = Date.now();
const START = END - 24 * 60 * 60 * 1000;

function at(offsetFraction) {
  return new Date(START + (END - START) * offsetFraction);
}
function iso(value) {
  return value.toISOString();
}

const LOG_MESSAGES = {
  debug: [
    "cache lookup hit for service list",
    "flushing buffered spans",
    "retrying delivery after backoff",
  ],
  info: [
    "batch of telemetry accepted",
    "project settings refreshed",
    "scheduled sweep completed",
    "session issued for api key",
  ],
  warn: [
    "ingestion lag above threshold",
    "slow query over 2s",
    "rate limit nearly reached",
  ],
  error: [
    "upstream returned 502",
    "failed to write span batch",
    "notification channel unreachable",
  ],
  fatal: [
    "worker crashed on unhandled rejection",
    "migration aborted, database locked",
  ],
};
const LEVELS = [
  ["debug", 0.2],
  ["info", 0.55],
  ["warn", 0.16],
  ["error", 0.08],
  ["fatal", 0.01],
];
function level() {
  let roll = next();
  for (const [name, weight] of LEVELS) {
    if ((roll -= weight) <= 0) {
      return name;
    }
  }
  return "info";
}

const logs = [];
for (let i = 0; i < LOG_COUNT; i += 1) {
  const when = at(i / LOG_COUNT);
  const severity = level();
  const service = pick(SERVICES);
  const isError = severity === "error" || severity === "fatal";
  logs.push({
    timestamp: when,
    level: severity,
    message: pick(LOG_MESSAGES[severity]),
    service,
    environment: pick(ENVIRONMENTS),
    trace_id: hex(32),
    span_id: hex(16),
    host: `${service}-${Math.floor(next() * 4)}.${pick(REGIONS)}`,
    region: pick(REGIONS),
    http_status: isError ? pick([502, 503, 500, 504]) : pick([200, 201, 204, 200]),
    duration_ms: Number((next() * (isError ? 4000 : 800) + 1).toFixed(3)),
    attributes: {
      sdk: `soonwhy-node/2.${Math.floor(next() * 9)}`,
      runtime: `node ${pick(["20", "22", "24"])}`,
      cpu_pct: Number((next() * 100).toFixed(1)),
    },
  });
}
logs.sort((a, b) => a.timestamp - b.timestamp);

const requests = [];
for (let i = 0; i < REQUEST_COUNT; i += 1) {
  const when = at(i / REQUEST_COUNT);
  const route = pick(PATHS);
  const [method, path] = route.split(" ");
  const status = next() < 0.9 ? pick([200, 200, 201, 204]) : pick([400, 401, 404, 500, 502]);
  requests.push({
    timestamp: when,
    method,
    path,
    status_code: status,
    duration_ms: Number((next() * (status >= 500 ? 3000 : 600) + 2).toFixed(3)),
    service: pick(SERVICES),
    environment: pick(ENVIRONMENTS),
    trace_id: hex(32),
    user_agent: pick([
      "soonwhy-sdk/2.1.0",
      "Mozilla/5.0 (Macintosh) Chrome/131",
      "curl/8.6.0",
      "Go-http-client/2.0",
    ]),
  });
}
requests.sort((a, b) => a.timestamp - b.timestamp);

const traces = [];
for (let i = 0; i < TRACE_COUNT; i += 1) {
  const traceId = hex(32);
  const start = at(i / TRACE_COUNT);
  const rootService = pick(SERVICES);
  for (let s = 0; s < SPANS_PER_TRACE; s += 1) {
    const startOffset = s * 12;
    const duration = Number((next() * 400 + 3).toFixed(3));
    traces.push({
      trace_id: traceId,
      span_id: hex(16),
      parent_span_id: s === 0 ? "" : hex(16),
      service: s === 0 ? rootService : pick(SERVICES),
      operation: pick(OPERATIONS),
      start_time: new Date(start.getTime() + startOffset),
      duration_ms: duration,
      status: next() < 0.93 ? "ok" : "error",
    });
  }
}
traces.sort((a, b) => a.start_time - b.start_time);

function sql(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}
function values(row) {
  return `(${row.map(sql).join(", ")})`;
}
function logRow(log) {
  return [
    iso(log.timestamp),
    log.level,
    log.message,
    log.service,
    log.environment,
    log.trace_id,
    log.span_id,
    log.host,
    log.region,
    log.http_status,
    log.duration_ms,
    JSON.stringify(log.attributes),
  ];
}
function requestRow(request) {
  return [
    iso(request.timestamp),
    request.method,
    request.path,
    request.status_code,
    request.duration_ms,
    request.service,
    request.environment,
    request.trace_id,
    request.user_agent,
  ];
}
function traceRow(span) {
  return [
    span.trace_id,
    span.span_id,
    span.parent_span_id,
    span.service,
    span.operation,
    iso(span.start_time),
    span.duration_ms,
    span.status,
  ];
}

function mysqlTime(value) {
  const text = iso(value);
  return `${text.slice(0, 10)} ${text.slice(11, 23)}`;
}
function mysqlLogRow(log) {
  const row = logRow(log);
  row[0] = mysqlTime(log.timestamp);
  return row;
}
function mysqlRequestRow(request) {
  const row = requestRow(request);
  row[0] = mysqlTime(request.timestamp);
  return row;
}
function mysqlTraceRow(span) {
  const row = traceRow(span);
  row[5] = mysqlTime(span.start_time);
  return row;
}

const logRows = logs.map((log) => values(logRow(log)));
const requestRows = requests.map((request) => values(requestRow(request)));
const traceRows = traces.map((span) => values(traceRow(span)));
const mysqlLogRows = logs.map((log) => values(mysqlLogRow(log)));
const mysqlRequestRows = requests.map((request) => values(mysqlRequestRow(request)));
const mysqlTraceRows = traces.map((span) => values(mysqlTraceRow(span)));

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) {
    out.push(list.slice(i, i + size));
  }
  return out;
}

function docker(container, args, input) {
  return execFileSync("docker", ["exec", "-i", container, ...args], {
    input,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}


const LOG_DDL = `
DROP TABLE IF EXISTS logs;
CREATE TABLE logs (
  id ${process.env.SQL_ID_TYPE ?? "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY"},
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  level VARCHAR(8) NOT NULL,
  message TEXT NOT NULL,
  service VARCHAR(32) NOT NULL,
  environment VARCHAR(16) NOT NULL,
  trace_id CHAR(32) NOT NULL,
  span_id CHAR(16) NOT NULL,
  host VARCHAR(64) NOT NULL,
  region VARCHAR(16) NOT NULL,
  http_status INTEGER,
  duration_ms DOUBLE PRECISION NOT NULL,
  attributes JSONB NOT NULL
);`;

const REQUEST_DDL = `
DROP TABLE IF EXISTS requests;
CREATE TABLE requests (
  id ${process.env.SQL_ID_TYPE ?? "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY"},
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  method VARCHAR(8) NOT NULL,
  path VARCHAR(128) NOT NULL,
  status_code INTEGER NOT NULL,
  duration_ms DOUBLE PRECISION NOT NULL,
  service VARCHAR(32) NOT NULL,
  environment VARCHAR(16) NOT NULL,
  trace_id CHAR(32) NOT NULL,
  user_agent VARCHAR(128) NOT NULL
);`;

const TRACE_DDL = `
DROP TABLE IF EXISTS traces;
CREATE TABLE traces (
  id ${process.env.SQL_ID_TYPE ?? "BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY"},
  trace_id CHAR(32) NOT NULL,
  span_id CHAR(16) NOT NULL,
  parent_span_id CHAR(16),
  service VARCHAR(32) NOT NULL,
  operation VARCHAR(64) NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_ms DOUBLE PRECISION NOT NULL,
  status VARCHAR(8) NOT NULL
);`;

const LOG_COLUMNS =
  "timestamp, level, message, service, environment, trace_id, span_id, host, region, http_status, duration_ms, attributes";
const REQUEST_COLUMNS =
  "timestamp, method, path, status_code, duration_ms, service, environment, trace_id, user_agent";
const TRACE_COLUMNS =
  "trace_id, span_id, parent_span_id, service, operation, start_time, duration_ms, status";

console.log("seed: postgres");
docker("heptadec-test-postgres", ["psql", "-U", PG.user, "-d", PG.database, "-q", "-v", "ON_ERROR_STOP=1"], [LOG_DDL, REQUEST_DDL, TRACE_DDL].join("\n"));
for (const group of chunk(logRows, 250)) {
  docker("heptadec-test-postgres", ["psql", "-U", PG.user, "-d", PG.database, "-q", "-v", "ON_ERROR_STOP=1"], `INSERT INTO logs (${LOG_COLUMNS}) VALUES\n${group.join(",\n")};`);
}
for (const group of chunk(requestRows, 250)) {
  docker("heptadec-test-postgres", ["psql", "-U", PG.user, "-d", PG.database, "-q", "-v", "ON_ERROR_STOP=1"], `INSERT INTO requests (${REQUEST_COLUMNS}) VALUES\n${group.join(",\n")};`);
}
for (const group of chunk(traceRows, 250)) {
  docker("heptadec-test-postgres", ["psql", "-U", PG.user, "-d", PG.database, "-q", "-v", "ON_ERROR_STOP=1"], `INSERT INTO traces (${TRACE_COLUMNS}) VALUES\n${group.join(",\n")};`);
}

function mysqlDdl(idType, timestampType) {
  return `
DROP TABLE IF EXISTS logs;
CREATE TABLE logs (
  id ${idType},
  timestamp ${timestampType} NOT NULL,
  level VARCHAR(8) NOT NULL,
  message TEXT NOT NULL,
  service VARCHAR(32) NOT NULL,
  environment VARCHAR(16) NOT NULL,
  trace_id CHAR(32) NOT NULL,
  span_id CHAR(16) NOT NULL,
  host VARCHAR(64) NOT NULL,
  region VARCHAR(16) NOT NULL,
  http_status INT NULL,
  duration_ms DOUBLE NOT NULL,
  attributes JSON NOT NULL,
  KEY idx_logs_timestamp (timestamp),
  KEY idx_logs_service (service)
) ENGINE=InnoDB;
DROP TABLE IF EXISTS requests;
CREATE TABLE requests (
  id ${idType},
  timestamp ${timestampType} NOT NULL,
  method VARCHAR(8) NOT NULL,
  path VARCHAR(128) NOT NULL,
  status_code INT NOT NULL,
  duration_ms DOUBLE NOT NULL,
  service VARCHAR(32) NOT NULL,
  environment VARCHAR(16) NOT NULL,
  trace_id CHAR(32) NOT NULL,
  user_agent VARCHAR(128) NOT NULL,
  KEY idx_requests_timestamp (timestamp)
) ENGINE=InnoDB;
DROP TABLE IF EXISTS traces;
CREATE TABLE traces (
  id ${idType},
  trace_id CHAR(32) NOT NULL,
  span_id CHAR(16) NOT NULL,
  parent_span_id CHAR(16) NULL,
  service VARCHAR(32) NOT NULL,
  operation VARCHAR(64) NOT NULL,
  start_time ${timestampType} NOT NULL,
  duration_ms DOUBLE NOT NULL,
  status VARCHAR(8) NOT NULL,
  KEY idx_traces_trace (trace_id)
) ENGINE=InnoDB;`.trim();
}

function seedMysqlFlavour(container, binary, idType, timestampType) {
  const run = (sql) => {
    docker(container, [binary, `-u${PG.user}`, `-p${PG.password}`, PG.database, "-NBe", sql]);
  };
  run(mysqlDdl(idType, timestampType));
  for (const group of chunk(mysqlLogRows, 200)) {
    run(`INSERT INTO logs (${LOG_COLUMNS}) VALUES\n${group.join(",\n")};`);
  }
  for (const group of chunk(mysqlRequestRows, 200)) {
    run(`INSERT INTO requests (${REQUEST_COLUMNS}) VALUES\n${group.join(",\n")};`);
  }
  for (const group of chunk(mysqlTraceRows, 200)) {
    run(`INSERT INTO traces (${TRACE_COLUMNS}) VALUES\n${group.join(",\n")};`);
  }
}

console.log("seed: mysql");
seedMysqlFlavour("heptadec-test-mysql", "mysql", "BIGINT AUTO_INCREMENT PRIMARY KEY", "DATETIME(3)");
console.log("seed: mariadb");
seedMysqlFlavour("heptadec-test-mariadb", "mariadb", "BIGINT AUTO_INCREMENT PRIMARY KEY", "DATETIME(3)");


console.log("seed: clickhouse");
docker(
  "heptadec-test-clickhouse",
  ["clickhouse-client", "--user", PG.user, "--password", PG.password, "--database", PG.database, "--multiquery"],
  `
DROP TABLE IF EXISTS logs;
CREATE TABLE logs (
  timestamp DateTime64(3, 'UTC'),
  level LowCardinality(String),
  message String,
  service LowCardinality(String),
  environment LowCardinality(String),
  trace_id String,
  span_id String,
  host String,
  region LowCardinality(String),
  http_status UInt16,
  duration_ms Float64,
  attributes Map(String, String)
) ENGINE = MergeTree
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (timestamp, service, trace_id);

DROP TABLE IF EXISTS requests;
CREATE TABLE requests (
  timestamp DateTime64(3, 'UTC'),
  method LowCardinality(String),
  path String,
  status_code UInt16,
  duration_ms Float64,
  service LowCardinality(String),
  environment LowCardinality(String),
  trace_id String,
  user_agent String
) ENGINE = MergeTree
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (timestamp, path);

DROP TABLE IF EXISTS traces;
CREATE TABLE traces (
  trace_id String,
  span_id String,
  parent_span_id String,
  service LowCardinality(String),
  operation String,
  start_time DateTime64(3, 'UTC'),
  duration_ms Float64,
  status LowCardinality(String)
) ENGINE = MergeTree
ORDER BY (trace_id, start_time);
`,
);

function clickhouseTime(value) {
  return `'${iso(value).slice(0, 23).replace("T", " ")}'`;
}
function tuple(fields) {
  return `(${fields.join(", ")})`;
}
const clickhouseLogs = logs.map((log) =>
  tuple([
    clickhouseTime(log.timestamp),
    sql(log.level),
    sql(log.message),
    sql(log.service),
    sql(log.environment),
    sql(log.trace_id),
    sql(log.span_id),
    sql(log.host),
    sql(log.region),
    log.http_status,
    log.duration_ms,
    `map(${Object.entries(log.attributes).map(([key, value]) => `${sql(key)}, ${sql(String(value))}`).join(", ")})`,
  ]),
);
const clickhouseRequests = requests.map((request) =>
  tuple([
    clickhouseTime(request.timestamp),
    sql(request.method),
    sql(request.path),
    request.status_code,
    request.duration_ms,
    sql(request.service),
    sql(request.environment),
    sql(request.trace_id),
    sql(request.user_agent),
  ]),
);
const clickhouseTraces = traces.map((span) =>
  tuple([
    sql(span.trace_id),
    sql(span.span_id),
    sql(span.parent_span_id),
    sql(span.service),
    sql(span.operation),
    clickhouseTime(span.start_time),
    span.duration_ms,
    sql(span.status),
  ]),
);

for (const group of chunk(clickhouseLogs, 300)) {
  docker("heptadec-test-clickhouse", ["clickhouse-client", "--user", PG.user, "--password", PG.password, "--database", PG.database], `INSERT INTO logs (${LOG_COLUMNS}) VALUES\n${group.join(",\n")};`);
}
for (const group of chunk(clickhouseRequests, 300)) {
  docker("heptadec-test-clickhouse", ["clickhouse-client", "--user", PG.user, "--password", PG.password, "--database", PG.database], `INSERT INTO requests (${REQUEST_COLUMNS}) VALUES\n${group.join(",\n")};`);
}
for (const group of chunk(clickhouseTraces, 300)) {
  docker("heptadec-test-clickhouse", ["clickhouse-client", "--user", PG.user, "--password", PG.password, "--database", PG.database], `INSERT INTO traces (${TRACE_COLUMNS}) VALUES\n${group.join(",\n")};`);
}


console.log("seed: libsql");
const libsqlStatements = [
  "DROP TABLE IF EXISTS logs",
  `CREATE TABLE logs (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, level TEXT NOT NULL, message TEXT NOT NULL, service TEXT NOT NULL, environment TEXT NOT NULL, trace_id TEXT NOT NULL, span_id TEXT NOT NULL, host TEXT NOT NULL, region TEXT NOT NULL, http_status INTEGER, duration_ms REAL NOT NULL, attributes TEXT NOT NULL)`,
  "DROP TABLE IF EXISTS requests",
  `CREATE TABLE requests (id INTEGER PRIMARY KEY AUTOINCREMENT, timestamp TEXT NOT NULL, method TEXT NOT NULL, path TEXT NOT NULL, status_code INTEGER NOT NULL, duration_ms REAL NOT NULL, service TEXT NOT NULL, environment TEXT NOT NULL, trace_id TEXT NOT NULL, user_agent TEXT NOT NULL)`,
  "DROP TABLE IF EXISTS traces",
  `CREATE TABLE traces (id INTEGER PRIMARY KEY AUTOINCREMENT, trace_id TEXT NOT NULL, span_id TEXT NOT NULL, parent_span_id TEXT, service TEXT NOT NULL, operation TEXT NOT NULL, start_time TEXT NOT NULL, duration_ms REAL NOT NULL, status TEXT NOT NULL)`,
];
async function libsqlExecute(statements) {
  const response = await fetch(`http://${HOST}:8081/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      statements: statements.map((statement) =>
        typeof statement === "string" ? statement : { q: statement.sql, params: statement.args },
      ),
    }),
  });
  if (!response.ok) {
    throw new Error(`libsql ${response.status}: ${await response.text()}`);
  }
  const payload = await response.json();
  const failed = payload.find((entry) => entry && entry.error);
  if (failed) {
    throw new Error(`libsql: ${failed.error}`);
  }
}
await libsqlExecute(libsqlStatements);
async function libsqlInsert(table, columns, rows) {
  const sql = `INSERT INTO ${table} (${columns}) VALUES (${rows[0].map(() => "?").join(", ")})`;
  for (const group of chunk(rows, 200)) {
    await libsqlExecute(group.map((args) => ({ sql, args })));
  }
}
await libsqlInsert("logs", LOG_COLUMNS, logs.map(logRow));
await libsqlInsert("requests", REQUEST_COLUMNS, requests.map(requestRow));
await libsqlInsert("traces", TRACE_COLUMNS, traces.map(traceRow));
async function libsqlCount(table) {
  const response = await fetch(`http://${HOST}:8081/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statements: [`SELECT COUNT(*) FROM ${table}`] }),
  });
  const payload = await response.json();
  return String(payload[0]?.results?.[0]?.count ?? payload[0]?.rows?.[0]?.[0] ?? "?");
}


console.log("seed: quickwit");
const quickwitIndex = (indexId, fields) => ({
  version: "0.8",
  index_id: indexId,
  doc_mapping: {
    field_mappings: fields,
    timestamp_field: fields.find((field) => field.type === "datetime").name,
    store_source: true,
  },
  indexing_settings: { commit_timeout_secs: 1 },
  search_settings: {
    default_search_fields: fields.filter((field) => field.indexed).map((field) => field.name),
  },
});
const textField = (name, tokenizer = "default", extra = {}) => ({
  name,
  type: "text",
  tokenizer,
  indexed: true,
  stored: true,
  ...extra,
});
const fastField = (name, type) => ({ name, type, indexed: true, stored: true, fast: true });

async function quickwitDelete(indexId) {
  await fetch(`http://${HOST}:7282/api/v1/indexes/${indexId}`, { method: "DELETE" });
}
async function quickwitCreate(index) {
  const response = await fetch(`http://${HOST}:7282/api/v1/indexes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(index),
  });
  if (!response.ok) {
    throw new Error(`quickwit create ${response.status}: ${await response.text()}`);
  }
}
async function quickwitIngest(indexId, ndjson) {
  const response = await fetch(`http://${HOST}:7282/api/v1/${indexId}/ingest?commit=force`, {
    method: "POST",
    headers: { "content-type": "application/x-ndjson" },
    body: ndjson,
  });
  if (!response.ok) {
    throw new Error(`quickwit ingest ${response.status}: ${await response.text()}`);
  }
}

await quickwitDelete("logs");
await quickwitCreate(
  quickwitIndex("logs", [
    fastField("timestamp", "datetime"),
    textField("level", "raw"),
    textField("message"),
    textField("service", "raw"),
    textField("environment", "raw"),
    textField("trace_id", "raw"),
    textField("span_id", "raw"),
    textField("host", "raw"),
    textField("region", "raw"),
    { name: "http_status", type: "i64", indexed: true, stored: true, fast: true },
    { name: "duration_ms", type: "f64", indexed: true, stored: true, fast: true },
    { name: "attributes", type: "json", indexed: false, stored: true },
  ]),
);
await quickwitIngest("logs", logs.map((log) => JSON.stringify({ ...log, timestamp: iso(log.timestamp) })).join("\n"));

await quickwitDelete("requests");
await quickwitCreate(
  quickwitIndex("requests", [
    fastField("timestamp", "datetime"),
    textField("method", "raw"),
    textField("path"),
    { name: "status_code", type: "i64", indexed: true, stored: true, fast: true },
    { name: "duration_ms", type: "f64", indexed: true, stored: true, fast: true },
    textField("service", "raw"),
    textField("environment", "raw"),
    textField("trace_id", "raw"),
    textField("user_agent"),
  ]),
);
await quickwitIngest("requests", requests.map((request) => JSON.stringify({ ...request, timestamp: iso(request.timestamp) })).join("\n"));

await quickwitDelete("traces");
await quickwitCreate(
  quickwitIndex("traces", [
    fastField("start_time", "datetime"),
    textField("trace_id", "raw"),
    textField("span_id", "raw"),
    textField("parent_span_id", "raw"),
    textField("service", "raw"),
    textField("operation"),
    { name: "duration_ms", type: "f64", indexed: true, stored: true, fast: true },
    textField("status", "raw"),
  ]),
);
await quickwitIngest("traces", traces.map((span) => JSON.stringify({ ...span, start_time: iso(span.start_time) })).join("\n"));


console.log("seed: redis");
function bulkAppend(chunks) {
  const parts = [];
  for (const command of chunks) {
    parts.push(`*${command.length}\r\n`);
    for (const arg of command) {
      const text = String(arg);
      parts.push(`$${Buffer.byteLength(text)}\r\n${text}\r\n`);
    }
  }
  return parts.join("");
}
const redisCommands = [];
for (const service of SERVICES) {
  redisCommands.push(["HSET", `service:${service}`, "name", service, "sdk", "soonwhy-node", "team", `team-${service}`]);
}
redisCommands.push(["DEL", "logs:recent"]);
logs.forEach((log, index) => {
  redisCommands.push([
    "HSET",
    `log:${index}`,
    "timestamp", iso(log.timestamp),
    "level", log.level,
    "message", log.message,
    "service", log.service,
    "environment", log.environment,
    "trace_id", log.trace_id,
    "span_id", log.span_id,
    "host", log.host,
    "region", log.region,
    "http_status", String(log.http_status),
    "duration_ms", String(log.duration_ms),
  ]);
  redisCommands.push(["ZADD", "logs:recent", String(log.timestamp.valueOf()), `log:${index}`]);
});
requests.forEach((request, index) => {
  redisCommands.push([
    "HSET",
    `request:${index}`,
    "timestamp", iso(request.timestamp),
    "method", request.method,
    "path", request.path,
    "status_code", String(request.status_code),
    "duration_ms", String(request.duration_ms),
    "service", request.service,
    "environment", request.environment,
    "trace_id", request.trace_id,
  ]);
});
traces.forEach((span, index) => {
  redisCommands.push([
    "HSET",
    `span:${index}`,
    "trace_id", span.trace_id,
    "span_id", span.span_id,
    "service", span.service,
    "operation", span.operation,
    "start_time", iso(span.start_time),
    "duration_ms", String(span.duration_ms),
    "status", span.status,
  ]);
  redisCommands.push(["ZADD", "trace:spans", String(span.start_time.valueOf()), `span:${index}`]);
});
docker("heptadec-test-redis", ["redis-cli", "--pipe"], bulkAppend(redisCommands));


console.log("seed: mongo");
const MONGO = ["mongosh", "-u", PG.user, "-p", PG.password, "--authenticationDatabase", "admin", PG.database, "--quiet"];
function mongoInsert(collection, documents) {
  docker(
    "heptadec-test-mongo",
    [...MONGO, "--file", "/dev/stdin"],
    `db.getCollection(${JSON.stringify(collection)}).deleteMany({});\n` +
      `db.getCollection(${JSON.stringify(collection)}).insertMany(${JSON.stringify(documents)});`,
  );
}
mongoInsert("logs", logs.map((log) => ({ ...log, timestamp: iso(log.timestamp) })));
mongoInsert("requests", requests.map((request) => ({ ...request, timestamp: iso(request.timestamp) })));
mongoInsert("traces", traces.map((span) => ({ ...span, start_time: iso(span.start_time) })));


console.log("seed: verifying");
const checks = [
  ["postgres logs", docker("heptadec-test-postgres", ["psql", "-U", PG.user, "-d", PG.database, "-tAc", "SELECT COUNT(*) FROM logs;"]).trim()],
  ["postgres requests", docker("heptadec-test-postgres", ["psql", "-U", PG.user, "-d", PG.database, "-tAc", "SELECT COUNT(*) FROM requests;"]).trim()],
  ["postgres traces", docker("heptadec-test-postgres", ["psql", "-U", PG.user, "-d", PG.database, "-tAc", "SELECT COUNT(*) FROM traces;"]).trim()],
  ["mysql logs", docker("heptadec-test-mysql", ["mysql", `-u${PG.user}`, `-p${PG.password}`, PG.database, "-NBe", "SELECT COUNT(*) FROM logs;"]).trim()],
  ["mariadb logs", docker("heptadec-test-mariadb", ["mariadb", `-u${PG.user}`, `-p${PG.password}`, PG.database, "-NBe", "SELECT COUNT(*) FROM logs;"]).trim()],
  ["clickhouse logs", docker("heptadec-test-clickhouse", ["clickhouse-client", "--user", PG.user, "--password", PG.password, "--database", PG.database, "-q", "SELECT COUNT(*) FROM logs;"]).trim()],
  ["redis recent", docker("heptadec-test-redis", ["redis-cli", "ZCARD", "logs:recent"]).trim()],
  ["libsql logs", await libsqlCount("logs")],
  ["libsql requests", await libsqlCount("requests")],
  ["libsql traces", await libsqlCount("traces")],
  ["mongo logs", docker("heptadec-test-mongo", [...MONGO, "--eval", "db.logs.countDocuments()"]).trim()],
  ["mongo requests", docker("heptadec-test-mongo", [...MONGO, "--eval", "db.requests.countDocuments()"]).trim()],
  ["mongo traces", docker("heptadec-test-mongo", [...MONGO, "--eval", "db.traces.countDocuments()"]).trim()],
];

for (const [label, count] of checks) {
  console.log(`  ${label}: ${count}`);
}

const quickwitCounts = await Promise.all(
  ["logs", "requests", "traces"].map(async (indexId) => {
    const response = await fetch(`http://${HOST}:7282/api/v1/${indexId}/search`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "*", max_hits: 0 }),
    });
    const payload = await response.json();
    return [indexId, payload.num_hits ?? 0];
  }),
);
for (const [label, count] of quickwitCounts) {
  console.log(`  quickwit ${label}: ${count}`);
}

console.log("seed: done");
