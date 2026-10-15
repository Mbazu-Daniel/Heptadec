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
    hasPassword: boolean;
    onboardingCompleted: boolean;
  };
  /** Both of these are for the active organization, not for the person: they
   * live on the member row, so the same user can be different in two of them. */
  displayName: string | null;
  image: string | null;
}