import { ForbiddenException } from "../../common/exceptions";
import { can } from "./authorize";

export async function requireOwner(headers: Headers, message: string): Promise<void> {
  if (!(await can(headers, "invitation", "create"))) {
    throw new ForbiddenException(message);
  }
}
