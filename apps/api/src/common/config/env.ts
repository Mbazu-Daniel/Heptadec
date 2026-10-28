function intFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  apiPort: intFromEnv("API_PORT", 8787),
  r2: {
    bucketName: process.env.R2_BUCKET_NAME ?? "",
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    publicId: process.env.R2_PUBLIC_ID ?? "",
    customDomain: process.env.R2_CUSTOM_DOMAIN ?? "",
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    sessionToken: process.env.R2_SESSION_TOKEN,
  },
  betterAuthUrl:
    process.env.BETTER_AUTH_URL ??
    process.env.PUBLIC_URL ??
    "http://localhost:8787",
  bachs: {
    secretKey: process.env.BACHS_SECRET_KEY ?? "",
    webhookSecret: process.env.BACHS_WEBHOOK_SECRET ?? "",
    baseUrl: process.env.BACHS_BASE_URL ?? "https://sandbox-api.bachs.io",
    prices: {
      monthly: process.env.BACHS_PRICE_MONTHLY ?? "",
      yearly: process.env.BACHS_PRICE_YEARLY ?? "",
    },
  },
  extraOrigins: (process.env.HEPTADEC_EXTRA_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? "",
  webUrl:
    process.env.WEB_URL ?? process.env.PUBLIC_URL ?? "http://localhost:5173",
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
