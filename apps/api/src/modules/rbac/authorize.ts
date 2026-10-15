import type { HeptadecDatabase } from "@heptadec/db";
import { authFor } from "../../common/config/better-auth";
import { statement } from "./permissions";

export type Resource = keyof typeof statement;

export type Action = (typeof statement)[Resource][number];

export async function can(
  db: HeptadecDatabase,
  headers: Headers,
  resource: Resource,
  action: Action,
): Promise<boolean> {
  const result = await authFor(db).api.hasPermission({
    body: { permissions: { [resource]: [action] } },
    headers,
  });
  return result.success;
}
