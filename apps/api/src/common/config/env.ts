import "@heptadec/db";

function intFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  apiPort: intFromEnv("API_PORT", 8787),
  betterAuthUrl: process.env.BETTER_AUTH_URL ?? "http://localhost:8787",
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
