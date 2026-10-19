import { loadDotEnv } from "../src/dotenv";

process.env.BETTER_AUTH_SECRET ??= "test-secret-for-integration-tests-0123456789";
process.env.BETTER_AUTH_URL ??= "http://localhost:8787";
process.env.HEPTADEC_SECRET_KEY ??= Buffer.from(
  "0123456789abcdef0123456789abcdef",
  "utf8",
).toString("base64");

process.env.BACHS_SECRET_KEY ??= "sk_sandbox_test_key";
process.env.BACHS_WEBHOOK_SECRET ??= "whsec_test_billing_webhook_secret";
process.env.BACHS_BASE_URL ??= "https://sandbox-api.bachs.io";
process.env.BACHS_PRODUCT_MONTHLY ??= "prod_test_monthly";
process.env.BACHS_PRODUCT_YEARLY ??= "prod_test_yearly";

loadDotEnv();
