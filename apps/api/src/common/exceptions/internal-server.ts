import { ApiException } from "./api-exception";

export class InternalServerException extends ApiException {
  constructor(message = "Internal server error") {
    super("internal_error", message);
  }
}
