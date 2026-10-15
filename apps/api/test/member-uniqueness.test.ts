import { expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { schema } from "@heptadec/db";
import { authFor } from "../src/common/config/better-auth";
import { signUp, uniqueEmail, uniqueSlug, db } from "./helpers";

const { member } = schema;

it("cannot hold two memberships for one person in one organization", async () => {
  const owner = await signUp(uniqueEmail());
  const org = await authFor(db).api.createOrganization({
    body: { name: "Dup Org", slug: uniqueSlug() },
    headers: { cookie: owner.cookie },
  });
  const guest = await signUp(uniqueEmail());

  await authFor(db).api.addMember({
    body: { userId: guest.user.id, role: "editor", organizationId: org.id },
    headers: { cookie: owner.cookie },
  });

  let secondError: string | null = null;
  try {
    await authFor(db).api.addMember({
      body: { userId: guest.user.id, role: "viewer", organizationId: org.id },
      headers: { cookie: owner.cookie },
    });
  } catch (caught) {
    secondError = caught instanceof Error ? caught.message : String(caught);
  }
  console.log("PROBE second addMember:", secondError ?? "SUCCEEDED (no guard)");

  const rows = await db
    .select()
    .from(member)
    .where(
      and(
        eq(member.userId, guest.user.id),
        eq(member.organizationId, org.id),
      ),
    );
  expect(rows).toHaveLength(1);

  const duplicate = await db
    .insert(member)
    .values({
      organizationId: org.id,
      userId: guest.user.id,
      role: "viewer",
      displayName: null,
      createdAt: new Date(),
    })
    .returning({ id: member.id })
    .then(
      () => null,
      () => "refused",
    );
  expect(duplicate).toBe("refused");
});
