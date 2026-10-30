import { loadDotEnv } from "../src/dotenv";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-integration-tests-0123456789";
process.env.BETTER_AUTH_URL ??= "http://localhost:8787";
// config prefers PUBLIC_URL over BETTER_AUTH_URL. Leaving it unset would let a
// developer's .env point the tests at a deployed host, which switches Better
// Auth to secure-cookie names and breaks every direct API call.
process.env.PUBLIC_URL ??= "http://localhost:8787";
process.env.HEPTADEC_SECRET_KEY ??= Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "utf8",
).toString("base64");

loadDotEnv();
