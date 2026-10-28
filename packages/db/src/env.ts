export const config = {
  dbUrl: process.env.DATABASE_URL ?? "file:./dev.db",
} as const;
