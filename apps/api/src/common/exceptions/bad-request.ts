import { ApiException } from "./api-exception";

export class BadRequestException extends ApiException {
  constructor(message = "Bad request") {
    super("bad_request", message);
  }
}
