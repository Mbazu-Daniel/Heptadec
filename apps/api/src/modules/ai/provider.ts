import { and, desc, eq } from "drizzle-orm";
import { schema } from "@heptadec/db";
import type { IOrganizationScope } from "../../common/session/current-organization";

const { aiProvider } = schema;

export async function chosenProvider(
  organization: IOrganizationScope,
  requested: unknown,
): Promise<typeof aiProvider.$inferSelect | null> {
  if (typeof requested === "string" && requested !== "") {
    const rows = await organization.db
      .select()
      .from(aiProvider)
      .where(
        and(
          eq(aiProvider.id, requested),
          organization.where(aiProvider.organizationId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }
  const rows = await organization.db
    .select()
    .from(aiProvider)
    .where(organization.where(aiProvider.organizationId))
    .orderBy(desc(aiProvider.isDefault), aiProvider.createdAt)
    .limit(1);
  return rows[0] ?? null;
}
