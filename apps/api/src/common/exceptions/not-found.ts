import { ApiException } from "./api-exception";

export class NotFoundException extends ApiException {
  constructor(message = "Not found") {
    super("not_found", message);
  }
}
