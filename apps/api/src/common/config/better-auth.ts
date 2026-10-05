import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { lastLoginMethod } from "better-auth/plugins";
import { db, schema } from "@heptadec/db";
import { config, socialCredentials } from "./env";
import { PROVIDERS, type ProviderId } from "../../modules/auth/contracts";
import { nameFromEmail } from "../helpers/name";
import { hashPassword, verifyPassword } from "../helpers/password";

type SocialCredentials = { clientId: string; clientSecret: string };

function socialProviders(): Partial<Record<ProviderId, SocialCredentials>> {
  const providers: Partial<Record<ProviderId, SocialCredentials>> = {};
  for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
    const { clientId, clientSecret } = socialCredentials(id);
    if (clientId && clientSecret) {
      providers[id] = { clientId, clientSecret };
    }
  }
  return providers;
}

export const auth = betterAuth({
  appName: "Heptadec",
  baseURL: config.betterAuthUrl,
  secret: config.betterAuthSecret,
  trustedOrigins: config.trustedOrigins,
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
  },
  socialProviders: socialProviders(),
  user: {
    additionalFields: {
      onboardingCompleted: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/sign-up/email" && ctx.body?.email) {
        return {
          context: {
            ...ctx,
            body: { ...ctx.body, name: nameFromEmail(String(ctx.body.email)) },
          },
        };
      }
    }),
  },
  plugins: [lastLoginMethod()],
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;