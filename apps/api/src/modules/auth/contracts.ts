export const PROVIDERS = {
  google: { label: "Sign in with Google" },
  github: { label: "Sign in with GitHub" },
} as const;

export type ProviderId = keyof typeof PROVIDERS;

export interface IProvider {
  id: ProviderId;
  label: string;
}

export interface IProvidersResponse {
  providers: IProvider[];
}

export interface IMe {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    hasPassword: boolean;
    onboardingCompleted: boolean;
  };
  displayName: string | null;
}