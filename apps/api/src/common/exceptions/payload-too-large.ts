import { ApiException } from "./api-exception";

export class PayloadTooLargeException extends ApiException {
  constructor(message = "Request body too large") {
    super("payload_too_large", message);
  }
}
