import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import { config } from "../src/common/config/env";
import { db } from "./helpers";
import { checkBillingReminders } from "../src/modules/billing/reminder";

const { billingPayment, notificationChannel } = schema;

async function createOrg(db: HeptadecDatabase, displayName: string, createdAtMs: number) {
  await db.insert(schema.organization).values({
    name: displayName,
    slug: `org-${Date.now()}`,
    createdAt: createdAtMs,
  } as any);
}

async function createChannel(db: HeptadecDatabase, organizationId: string, kind: string) {
  await db.insert(schema.notificationChannel).values({
    organizationId,
    name: `${kind} channel`,
    kind,
    recipients: JSON.stringify(["test@example.com"]),
    config: JSON.stringify({ kind, webhookUrl: "https://example.com", channel: null }),
  } as any);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const orgInsert: any = {
  name: "Reminder Org",
  slug: "org-reminder-test",
  createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).getTime(),
};

describe("checkBillingReminders", () => {
  it("sends nothing when billing is not configured", async () => {
    const oldKey = config.bachs.secretKey;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (config as any).bachs.secretKey = "";
    const sent = await checkBillingReminders(db, new Date());
    expect(sent).toBe(0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (config as any).bachs.secretKey = oldKey;
  });

  it("sends nothing for entitled organisations", async () => {
    const orgId = "org-entitled-" + Date.now();
    await createOrg(db, "Entitled Org", Date.now());
    await createChannel(db, orgId, "resend");
    await db.insert(billingPayment).values({
      organizationId: orgId,
      customerId: "cust_1",
      checkoutId: "chk_1",
      amount: "5000.00",
      currency: "USD",
      status: "completed",
      periodEndsAt: null,
      createdAt: new Date(),
    });

    const sent = await checkBillingReminders(db, new Date());
    expect(sent).toBe(0);
  });

  it("sends a reminder for a non-entitled organisation with channels", async () => {
    const orgId = "org-reminder-" + Date.now();
    await createOrg(db, "Reminder Org", Date.now() - 8 * 24 * 60 * 60 * 1000);
    await createChannel(db, orgId, "resend");

    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await db.insert(schema.organization).values({
      id: orgId,
      name: "Reminder Org",
      slug: orgId,
      createdAt: createdAt.getTime(),
    } as any);

    const sent = await checkBillingReminders(db, new Date());
    expect(sent).toBe(1);
  });

  it("does not remind within the 24h cooldown", async () => {
    const orgId = "org-recent-" + Date.now();
    await createOrg(db, "Recenty Reminded", Date.now() - 8 * 24 * 60 * 60 * 1000);
    await createChannel(db, orgId, "resend");

    const createdAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    await db.insert(schema.organization).values({
      id: orgId,
      name: "Recenty Reminded",
      slug: orgId,
      createdAt: createdAt.getTime(),
    } as any);

    await checkBillingReminders(db, new Date());
    const orgAfterFirst = await db
      .select()
      .from(schema.organization)
      .where(eq(schema.organization.id, orgId));
    expect(orgAfterFirst[0]?.lastBillingReminderAt).not.toBeNull();

    const sent = await checkBillingReminders(db, new Date());
    expect(sent).toBe(0);
  });
});
