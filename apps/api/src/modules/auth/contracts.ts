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
    /**
     * The person's own image, and the user table's, but nothing in this app
     * writes it: it belongs to whoever administers the platform, which is not a
     * thing Heptadec is. Reported so the fact has one reader rather than two
     * writers that can disagree.
     */
    image: string | null;
    hasPassword: boolean;
    onboardingCompleted: boolean;
  };
  /** The avatar for this membership in this organization, beside the display
   * name that also lives on the member row. This is the one the app manages. */
  displayName: string | null;
  image: string | null;
}