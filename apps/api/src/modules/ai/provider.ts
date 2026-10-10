import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@heptadec/db";

const { aiProvider } = schema;

export async function chosenProvider(
  organizationId: string,
  requested: unknown,
): Promise<typeof aiProvider.$inferSelect | null> {
  if (typeof requested === "string" && requested !== "") {
    const rows = await db
      .select()
      .from(aiProvider)
      .where(
        and(
          eq(aiProvider.id, requested),
          eq(aiProvider.organizationId, organizationId),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }
  const rows = await db
    .select()
    .from(aiProvider)
    .where(eq(aiProvider.organizationId, organizationId))
    .orderBy(desc(aiProvider.isDefault), aiProvider.createdAt)
    .limit(1);
  return rows[0] ?? null;
}
