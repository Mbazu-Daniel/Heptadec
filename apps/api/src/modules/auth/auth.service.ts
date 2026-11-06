import { and, eq } from "drizzle-orm";
import {
  account,
  user,
  type HeptadecDatabase,
} from "@heptadec/db";
import { authFor } from "../../common/config/better-auth";
import {
  PROVIDERS,
  type IMe,
  type IProvider,
  type IProvidersResponse,
  type ProviderId,
} from "./contracts";
import { mediaUrl } from "../images/urls";
import type {
  ICompleteOnboardingInput,
  IGetMeInput,
} from "./types";

function enabledProviders(db: HeptadecDatabase): IProvider[] {
  const enabled = Object.keys(
    authFor(db).options.socialProviders ?? {},
  ) as ProviderId[];
  return enabled.map((id) => ({ id, label: PROVIDERS[id].label }));
}

export async function listProviders(
  db: HeptadecDatabase,
): Promise<IProvidersResponse> {
  return { providers: enabledProviders(db) };
}

export async function getMe(
  db: HeptadecDatabase,
  input: IGetMeInput,
): Promise<IMe> {
  const credential = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(eq(account.userId, input.session.user.id), eq(account.providerId, "credential")),
    )
    .limit(1);

  return {
    user: {
      id: input.session.user.id,
      name: input.session.user.name,
      email: input.session.user.email,
      image: mediaUrl(input.session.user.image ?? null, input.publicBase),
      hasPassword: credential.length > 0,
      onboardingCompleted: input.session.user.onboardingCompleted ?? false,
    },
    displayName: input.organization?.caller.displayName ?? null,
    image: mediaUrl(input.organization?.caller.image ?? null, input.publicBase),
  };
}

export async function completeOnboarding(
  db: HeptadecDatabase,
  input: ICompleteOnboardingInput,
): Promise<void> {
  await db
    .update(user)
    .set({ onboardingCompleted: true, updatedAt: new Date() })
    .where(eq(user.id, input.userId));
}
