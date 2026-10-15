import type { HeptadecDatabase } from "@heptadec/db";
import { ForbiddenException } from "../../common/exceptions";
import { can } from "./authorize";

export async function requireOwner(
  db: HeptadecDatabase,
  headers: Headers,
  message: string,
): Promise<void> {
  if (!(await can(db, headers, "invitation", "create"))) {
    throw new ForbiddenException(message);
  }
}
