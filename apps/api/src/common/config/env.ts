function intFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  apiPort: intFromEnv("API_PORT", 8787),
  /**
   * The Node server has no R2 binding, so the bucket's settings come from the
   * environment here and are handed to the app as bindings. Unset means images
   * are not configured, which the API reports rather than failing at an upload.
   *
   * The account is the one Cloudflare account, not an R2-specific one: the S3
   * endpoint is built from it, and the deploy script reads the same variable to
   * know which account to deploy into.
   */
  r2: {
    bucketName: process.env.R2_BUCKET_NAME ?? "",
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    publicId: process.env.R2_PUBLIC_ID ?? "",
    customDomain: process.env.R2_CUSTOM_DOMAIN ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
  betterAuthUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:8787",
  /**
   * Bachs holds the products and the card details; Heptadec holds only the
   * subscription state its webhooks report. The base URL defaults to the
   * sandbox because a sandbox key is what a deployment starts with, and a
   * sandbox key against the live host is refused rather than charged.
   */
  bachs: {
    secretKey: process.env.BACHS_SECRET_KEY ?? "",
    webhookSecret: process.env.BACHS_WEBHOOK_SECRET ?? "",
    baseUrl: process.env.BACHS_BASE_URL ?? "https://sandbox-api.bachs.io",
    products: {
      monthly: process.env.BACHS_PRODUCT_MONTHLY ?? "",
      yearly: process.env.BACHS_PRODUCT_YEARLY ?? "",
    },
  },
  extraOrigins: (process.env.HEPTADEC_EXTRA_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? "",
  webUrl: process.env.WEB_URL ?? "http://localhost:5173",
  schedulerTickMs: intFromEnv("SCHEDULER_TICK_MS", 30_000),
} as const;

export function socialCredentials(id: string): {
  clientId: string;
  clientSecret: string;
} {
  const prefix = id.toUpperCase();
  return {
    clientId: process.env[`${prefix}_CLIENT_ID`] ?? "",
    clientSecret: process.env[`${prefix}_CLIENT_SECRET`] ?? "",
  };
}
