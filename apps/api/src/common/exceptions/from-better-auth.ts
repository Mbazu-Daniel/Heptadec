import { APIError } from "better-auth/api";
import { ApiException } from "./api-exception";
import { ForbiddenException } from "./forbidden";
import { BadRequestException } from "./bad-request";
import { UnauthorizedException } from "./unauthorized";

function mapErrorCode(code: string): string {
  const messages: Record<string, string> = {
    USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "An account with this email already exists",
    USER_ALREADY_EXISTS: "An account with this email already exists",
    INVALID_EMAIL_OR_PASSWORD: "Invalid email or password",
    INVALID_TOKEN: "The reset link is invalid or has expired",
    TOKEN_EXPIRED: "The reset link has expired. Please request a new one",
    VALIDATION_ERROR: "Please check your input and try again",
    EMAIL_NOT_VERIFIED: "Please verify your email address before signing in",
    SIGNUP_DISABLED: "Sign up is currently disabled",
    ACCOUNT_NOT_LINKED: "This account is not linked. Please sign in with your original method",
    OAUTH_PROVIDER_NOT_FOUND: "Sign in provider not configured",
    EMAIL_NOT_FOUND: "No account found with this email",
    UNABLE_TO_CREATE_USER: "Unable to create account. Please try again",
    UNABLE_TO_CREATE_SESSION: "Unable to sign in. Please try again",
    INVALID_CALLBACK_REQUEST: "Invalid sign in request. Please try again",
    STATE_INVALID: "Sign in session expired. Please try again",
    STATE_MISMATCH: "Sign in session mismatch. Please try again",
  };
  return messages[code] ?? "";
}

export function fromBetterAuth(error: APIError): ApiException | null {
  const code = error.body?.code as string | undefined;
  const message = mapErrorCode(code ?? "") ?? error.body?.message ?? error.message;

  if (error.statusCode === 401 || error.status === "UNAUTHORIZED") {
    return new UnauthorizedException(message);
  }
  if (error.statusCode === 403 || error.status === "FORBIDDEN") {
    return new ForbiddenException(message);
  }
  if (error.statusCode === 400 || error.status === "BAD_REQUEST") {
    return new BadRequestException(message);
  }
  return null;
}

export function isBetterAuthError(error: unknown): error is APIError {
  return error instanceof APIError;
}
