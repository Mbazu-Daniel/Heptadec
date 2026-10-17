import { loadDotEnv } from "../src/dotenv";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-integration-tests-0123456789";
process.env.BETTER_AUTH_URL ??= "http://localhost:8787";
process.env.HEPTADEC_SECRET_KEY ??= Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "utf8",
).toString("base64");

/**
 * Billing is configured with sandbox-shaped values so the routes are wired up,
 * but pointed at Bachs's own test host: no test may reach the real API with the
 * key below. `config` reads the environment once, when it is first imported, so
 * these have to be in place before any test file pulls the app in.
 */
process.env.BACHS_SECRET_KEY ??= "sk_sandbox_test_key";
process.env.BACHS_WEBHOOK_SECRET ??= "whsec_test_billing_webhook_secret";
process.env.BACHS_BASE_URL ??= "https://sandbox-api.bachs.io";
process.env.BACHS_PRODUCT_MONTHLY ??= "prod_test_monthly";
process.env.BACHS_PRODUCT_YEARLY ??= "prod_test_yearly";

loadDotEnv();
