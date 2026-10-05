import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ERROR_CODES, type ErrorCode } from "../constants";
import { ApiException } from "./api-exception";

const CODE_BY_STATUS: Map<number, ErrorCode> = new Map(
  Object.entries(ERROR_CODES).map(([code, status]) => [status, code as ErrorCode]),
);

export interface IErrorResponse {
  status: ContentfulStatusCode;
  body: { error: { code: string; message: string } };
}

export function toErrorResponse(error: HTTPException): IErrorResponse {
  const code =
    error instanceof ApiException
      ? error.code
      : CODE_BY_STATUS.get(error.status) ?? "request_failed";
  return {
    status: error.status as ContentfulStatusCode,
    body: {
      error: { code, message: error.message || "Request failed" },
    },
  };
}
