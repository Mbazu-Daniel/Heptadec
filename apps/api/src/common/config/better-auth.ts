import { betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { lastLoginMethod, organization } from "better-auth/plugins";
import { apiKey } from "@better-auth/api-key";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import { config, socialCredentials } from "./env";
import { requestOrigins } from "./origins";
import { PROVIDERS, type ProviderId } from "../../modules/auth/contracts";
import { sendPasswordResetEmail } from "../../modules/auth/password-reset";
import { ac, roles } from "../../modules/rbac/permissions";
import { sendInvitationEmail } from "../../modules/invitation/mailer";
import {
  auditActorOf,
  recordAudit,
} from "../../modules/audit/record";
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

type HeptadecAuth = ReturnType<typeof buildAuth>;

const instances = new WeakMap<HeptadecDatabase, HeptadecAuth>();

export function authFor(db: HeptadecDatabase): HeptadecAuth {
  const existing = instances.get(db);
  if (existing !== undefined) {
    return existing;
  }
  const created = buildAuth(db);
  instances.set(db, created);
  return created;
}

function buildAuth(db: HeptadecDatabase) {
  return betterAuth({
    appName: "Heptadec",
    baseURL: config.betterAuthUrl,
    secret: config.betterAuthSecret,
    trustedOrigins: async (request) => requestOrigins(request),
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
      sendResetPassword: async ({ user, token }) => {
        await sendPasswordResetEmail({ email: user.email, token });
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
    plugins: [
      lastLoginMethod(),
      organization({
        ac,
        roles,
        sendInvitationEmail,
        organizationHooks: {
          afterCreateOrganization: async ({ organization, user }) => {
            const actor = auditActorOf(user);
            await recordAudit(db, {
              organizationId: organization.id,
              actorId: actor.id,
              actorLabel: actor.label,
              event: "organization.created",
              targetKind: "organization",
              targetId: organization.id,
              targetLabel: organization.name,
            });
          },
          afterUpdateOrganization: async ({ organization, user }) => {
            if (organization === null || organization === undefined) {
              return;
            }
            const actor = auditActorOf(user);
            await recordAudit(db, {
              organizationId: organization.id,
              actorId: actor.id,
              actorLabel: actor.label,
              event: "organization.updated",
              targetKind: "organization",
              targetId: organization.id,
              targetLabel: organization.name,
            });
          },
          afterCreateInvitation: async ({ invitation, inviter }) => {
            const actor = auditActorOf(inviter);
            await recordAudit(db, {
              organizationId: invitation.organizationId,
              actorId: actor.id,
              actorLabel: actor.label,
              event: "invitation.created",
              targetKind: "invitation",
              targetId: invitation.id,
              targetLabel: invitation.email,
              detail: invitation.role,
            });
          },
        },
        schema: {
          member: {
            additionalFields: {
              displayName: { type: "string", required: false, input: true },
            },
          },
        },
      }),
      apiKey({
        references: "organization",
        configId: "mcp",
        defaultPrefix: "hdc_",
        enableMetadata: true,
        rateLimit: { enabled: false },
      }),
    ],
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
  });
}

export type AuthSession = ReturnType<typeof authFor>["$Infer"]["Session"];