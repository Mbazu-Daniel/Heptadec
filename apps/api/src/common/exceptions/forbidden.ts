import { ApiException } from "./api-exception";

export class ForbiddenException extends ApiException {
  constructor(message = "Forbidden") {
    super("forbidden", message);
  }
}
