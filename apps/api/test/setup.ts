import { loadDotEnv } from "../src/dotenv";

// The deployment's own .env is read first, then the values a test run owns are
// written over it. Vitest puts .env in the environment before this file runs, so
// assigning only what is missing would leave the deployed URL and keys in place:
// Better Auth binds a session cookie to the host its URL names, and a production
// host makes every session the suites create read back as signed out.
loadDotEnv();

// PUBLIC_URL wins over BETTER_AUTH_URL and WEB_URL in the config, so a deployed
// value there moves the whole app's address even when the two below are pinned.
delete process.env.PUBLIC_URL;
process.env.BETTER_AUTH_SECRET = "test-secret-for-integration-tests-0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:8787";
process.env.WEB_URL = "http://localhost:5173";
process.env.HEPTADEC_SECRET_KEY = Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "utf8",
).toString("base64");
