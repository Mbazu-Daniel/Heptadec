import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import { config } from "../src/common/config/env";
import { encryptSecret } from "../src/modules/data-source/secret";
import { db } from "./helpers";
import { checkBillingReminders } from "../src/modules/billing/reminder";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The sends the expectations read go to a local HTTP receiver, so delivery
 * runs the app's real fetch path with no outside network.
 */
let receiver: Server | undefined;
let webhookUrl = "";

const createdOrgIds: string[] = [];

async function createOrg(
  db: HeptadecDatabase,
  displayName: string,
  createdAtMs: number,
): Promise<string> {
  const inserted = await db
    .insert(schema.organization)
    .values({
      name: displayName,
      slug: `org-${Date.now()}`,
      createdAt: new Date(createdAtMs),
    })
    .returning({ id: schema.organization.id });
  createdOrgIds.push(inserted[0]!.id);
  return inserted[0]!.id;
}

async function createChannel(db: HeptadecDatabase, organizationId: string) {
  await db.insert(schema.notificationChannel).values({
    organizationId,
    name: "slack channel",
    kind: "slack",
    recipients: JSON.stringify(["test@example.com"]),
    config: await encryptSecret(
      JSON.stringify({ kind: "slack", webhookUrl, channel: null }),
    ),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

beforeAll(async () => {
  receiver = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise<void>((started) => receiver!.listen(0, "127.0.0.1", () => started()));
  webhookUrl = `http://127.0.0.1:${(receiver!.address() as AddressInfo).port}/hook`;
});

afterAll(async () => {
  for (const organizationId of createdOrgIds) {
    await db
      .delete(schema.billingPayment)
      .where(eq(schema.billingPayment.organizationId, organizationId));
    await db
      .delete(schema.notificationChannel)
      .where(eq(schema.notificationChannel.organizationId, organizationId));
    await db.delete(schema.organization).where(eq(schema.organization.id, organizationId));
  }
  await new Promise<void>((closed) => receiver?.close(() => closed()));
});

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
    createdOrgIds.push(orgId);
    await createOrg(db, "Entitled Org", Date.now());
    await createChannel(db, orgId);
    await db.insert(schema.billingPayment).values({
      organizationId: orgId,
      customerId: "cust_1",
      checkoutId: `chk_1-${Date.now()}`,
      amount: "5000.00",
      currency: "USD",
      status: "completed",
      periodEndsAt: null,
      createdAt: new Date(),
    });

    const sent = await checkBillingReminders(db, new Date());
    expect(sent).toBe(0);
  }, 60_000);

  it("sends a reminder for a non-entitled organisation with channels", async () => {
    const orgId = "org-reminder-" + Date.now();
    createdOrgIds.push(orgId);
    await createOrg(db, "Reminder Org", Date.now() - 8 * DAY_MS);
    await createChannel(db, orgId);
    await db.insert(schema.organization).values({
      id: orgId,
      name: "Reminder Org",
      slug: orgId,
      createdAt: new Date(Date.now() - 8 * DAY_MS),
    });

    const sent = await checkBillingReminders(db, new Date());
    expect(sent).toBe(1);
  }, 30_000);

  it("does not remind within the 24h cooldown", async () => {
    const orgId = "org-recent-" + Date.now();
    createdOrgIds.push(orgId);
    await createOrg(db, "Recenty Reminded", Date.now() - 8 * DAY_MS);
    await createChannel(db, orgId);
    await db.insert(schema.organization).values({
      id: orgId,
      name: "Recenty Reminded",
      slug: orgId,
      createdAt: new Date(Date.now() - 8 * DAY_MS),
    });

    await checkBillingReminders(db, new Date());
    const orgAfterFirst = await db
      .select()
      .from(schema.organization)
      .where(eq(schema.organization.id, orgId));
    expect(orgAfterFirst[0]?.lastBillingReminderAt).not.toBeNull();

    const sent = await checkBillingReminders(db, new Date());
    expect(sent).toBe(0);
  }, 60_000);
});
