import { loadDotEnv } from "../src/dotenv";

const TEST_DATABASE_URL = "file:./test.db";

process.env.DATABASE_URL ??= TEST_DATABASE_URL;
if (/dev\.db$/.test(process.env.DATABASE_URL)) {
  throw new Error(
    `Tests refuse to run against ${process.env.DATABASE_URL}. Unset DATABASE_URL to use ${TEST_DATABASE_URL}.`,
  );
}

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-integration-tests-0123456789";
process.env.BETTER_AUTH_URL ??= "http://localhost:8787";
process.env.HEPTADEC_SECRET_KEY ??= Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "utf8",
).toString("base64");

loadDotEnv();
