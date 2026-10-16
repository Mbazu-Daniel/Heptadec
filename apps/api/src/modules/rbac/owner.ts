import type { Context } from "hono";
import { ForbiddenException } from "../../common/exceptions";
import type { IAuthVars } from "../../common/middleware/require-session";
import { activeOrganization } from "../../common/session/current-organization";
import { roleOf } from "./roles";

// "Only an owner" is a statement about the role, and the request's scope already
// carries it: requireSession read it once, off the same query that proved the
// membership. Asking a permission instead — invitation:create, organization:update
// — made an owner-only rule depend on a permission that has nothing to do with
// it, so widening that permission would silently widen who administers AI
// providers, notifications, the audit log and the organization itself.
export function requireOwner(c: Context<IAuthVars>, message: string): void {
  if (roleOf(activeOrganization(c).caller.role) !== "owner") {
    throw new ForbiddenException(message);
  }
}
