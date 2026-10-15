import type { ErrorCode } from "../constants";

export type ApiErrorCode = ErrorCode | "request_failed";

export interface IErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}
