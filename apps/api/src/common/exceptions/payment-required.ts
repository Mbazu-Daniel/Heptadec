import { ApiException } from "./api-exception";

export class PaymentRequiredException extends ApiException {
  constructor(message = "Payment required") {
    super("payment_required", message);
  }
}
