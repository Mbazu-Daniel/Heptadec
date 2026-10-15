import { ApiException } from "./api-exception";

export class UnauthorizedException extends ApiException {
  constructor(message = "Authentication required") {
    super("unauthorized", message);
  }
}
