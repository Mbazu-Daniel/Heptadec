#!/usr/bin/env node

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
const results = Array.isArray(body) ? body : [body];
const failure = results.find(
  (entry) => typeof entry?.error === "object" && entry.error !== null,
);
if (failure !== undefined) {
  console.error(
    `seed: libsql rejected a statement: ${JSON.stringify(failure.error)}`,
  );
  process.exit(1);
}
