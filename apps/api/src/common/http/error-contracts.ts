import type { ErrorCode } from "../constants/error-code.const";

export type ApiErrorCode = ErrorCode | "request_failed";

export interface IErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}
