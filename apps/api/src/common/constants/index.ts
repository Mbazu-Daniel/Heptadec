export const MAX_BODY_BYTES = 1024 * 1024;

export const ERROR_CODES = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  payload_too_large: 413,
  too_many_requests: 429,
  internal_error: 500,
} as const;

export type ErrorCode = keyof typeof ERROR_CODES;