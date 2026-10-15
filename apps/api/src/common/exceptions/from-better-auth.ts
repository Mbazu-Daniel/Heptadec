import { APIError } from "better-auth/api";
import { ApiException } from "./api-exception";
import { ForbiddenException } from "./forbidden";
import { BadRequestException } from "./bad-request";

export function fromBetterAuth(error: APIError): ApiException | null {
  const message = error.body?.message ?? error.message;

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
