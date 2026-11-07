import { HTTPException } from "hono/http-exception";
import { ERROR_CODES, type ErrorCode } from "../constants/error-code.const";

export class ApiException extends HTTPException {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(ERROR_CODES[code], { message });
    this.name = new.target.name;
    this.code = code;
  }
}
