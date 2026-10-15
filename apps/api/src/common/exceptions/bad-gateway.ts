import { ApiException } from "./api-exception";

export class BadGatewayException extends ApiException {
  constructor(message = "Bad gateway") {
    super("bad_gateway", message);
  }
}
