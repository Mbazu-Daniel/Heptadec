import "./setup";

process.env.BACHS_SECRET_KEY = "sk_sandbox_test_key";
process.env.BACHS_WEBHOOK_SECRET = "whsec_test_billing_webhook_secret";
process.env.BACHS_BASE_URL = "https://sandbox-api.bachs.io";
// Deliberately not dollars: the plans have to come from the environment, so
// the prices below are what the app has to show.
process.env.BACHS_CURRENCY = "NGN";
process.env.BACHS_PRICE_MONTHLY = "7500.00";
process.env.BACHS_PRICE_YEARLY = "75000.00";
process.env.BACHS_PRODUCT_MONTHLY = "prod_test_monthly";
process.env.BACHS_PRODUCT_YEARLY = "prod_test_yearly";
