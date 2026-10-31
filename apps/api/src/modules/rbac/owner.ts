import type { Context } from "hono";
import { ForbiddenException } from "../../common/exceptions";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import { roleOf } from "./roles";

export function requireOwner(c: Context<IAuthVars>, message: string): void {
  if (roleOf(activeOrganization(c).caller.role) !== "owner") {
    throw new ForbiddenException(message);
  }
}
