import type { AuthSession } from "../../common/config/better-auth";
import type { IRequestScope } from "../../common/session/current-organization";

export interface IGetMeInput {
  session: AuthSession;
  organization: IRequestScope | null;
  publicBase: string | null;
}

export interface ICompleteOnboardingInput {
  userId: string;
}
