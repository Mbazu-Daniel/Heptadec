import { ApiException } from "./api-exception";

export class TooManyRequestsException extends ApiException {
  constructor(message = "Too many requests") {
    super("too_many_requests", message);
  }
}
