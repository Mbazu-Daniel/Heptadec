#!/usr/bin/env node
// Applies a SQLite fixture to a sqld server, which is how the LibSQL test-stack
// engine takes schema.
//
// sqld's HTTP API runs one statement per array entry rather than a whole script,
// so the fixture is split first. The split is safe because the fixtures in
// docker/schema keep every semicolon at the end of a statement and never inside
// a string — if one ever needs to, this is where to change.

import { readFileSync } from "node:fs";

const [fixture, endpoint] = process.argv.slice(2);

if (fixture === undefined || endpoint === undefined) {
  console.error("usage: seed-libsql.mjs <fixture.sql> <endpoint>");
  process.exit(1);
}

const withoutComments = readFileSync(fixture, "utf8")
  .split("\n")
  .filter((line) => !line.trim().startsWith("--"))
  .join("\n");

const statements = withoutComments
  .split(";")
  .map((statement) => statement.trim())
  .filter((statement) => statement.length > 0);

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ statements }),
});

if (!response.ok) {
  console.error(`seed: libsql refused the fixture: ${await response.text()}`);
  process.exit(1);
}

const body = await response.json();
const failure = typeof body?.error === "string" ? body.error : null;
if (failure !== null) {
  console.error(`seed: libsql rejected a statement: ${failure}`);
  process.exit(1);
}
