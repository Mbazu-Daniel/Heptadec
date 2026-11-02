import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import { config } from "../src/common/config/env";
import { encryptSecret } from "../src/modules/data-source/secret";
import { checkBillingReminders } from "../src/modules/billing/reminder";
import { db, signUp, uniqueEmail, uniqueSlug } from "./helpers";

const DAY_MS = 24 * 60 * 60 * 1000;

let receiver: Server | undefined;
let webhookUrl = "";

const createdOrgIds: string[] = [];

async function newOwner(): Promise<string> {
  const { user } = await signUp(uniqueEmail());
  return user.id;
}

async function ownedOrganization(
  database: HeptadecDatabase,
  userId: string,
  createdAtMs: number,
): Promise<string> {
  const inserted = await database
    .insert(schema.organization)
    .values({
      name: "Reminder Org",
      slug: uniqueSlug(),
      createdAt: new Date(createdAtMs),
    })
    .returning({ id: schema.organization.id });
  const organizationId = inserted[0]!.id;
  await database
    .insert(schema.member)
    .values({
      organizationId,
      userId,
      role: "owner",
      createdAt: new Date(createdAtMs),
    });
  createdOrgIds.push(organizationId);
  return organizationId;
}

async function createChannel(
  database: HeptadecDatabase,
  organizationId: string,
): Promise<void> {
  await database.insert(schema.notificationChannel).values({
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
  await new Promise<void>((started) =>
    receiver!.listen(0, "127.0.0.1", () => started()),
  );
  webhookUrl = `http://127.0.0.1:${(receiver!.address() as AddressInfo).port}/hook`;
});

afterAll(async () => {
  for (const organizationId of createdOrgIds) {
    await db
      .delete(schema.billingPayment)
      .where(eq(schema.billingPayment.organizationId, organizationId));
    await db
      .delete(schema.billingCustomer)
      .where(eq(schema.billingCustomer.organizationId, organizationId));
    await db
      .delete(schema.notificationChannel)
      .where(eq(schema.notificationChannel.organizationId, organizationId));
    await db
      .delete(schema.member)
      .where(eq(schema.member.organizationId, organizationId));
    await db
      .delete(schema.organization)
      .where(eq(schema.organization.id, organizationId));
  }
  await new Promise<void>((closed) => receiver?.close(() => closed()));
});

const originalSecretKey = config.bachs.secretKey;
const bachsSettings = config.bachs as { secretKey: string };

afterEach(() => {
  bachsSettings.secretKey = originalSecretKey;
});

describe("checkBillingReminders", () => {
  it("sends nothing when billing is not configured", async () => {
    bachsSettings.secretKey = "";
    const sent = await checkBillingReminders(db, new Date());
    expect(sent).toBe(0);
  });

  it("sends nothing for a lone organization kept long past the old trial window", async () => {
    const userId = await newOwner();
    const organizationId = await ownedOrganization(db, userId, Date.now());
    await createChannel(db, organizationId);

    const sent = await checkBillingReminders(db, new Date());
    expect(sent).toBe(0);
  }, 60_000);

  it("sends nothing for an organization whose paid period is still running", async () => {
    const userId = await newOwner();
    const organizationId = await ownedOrganization(db, userId, Date.now() - 40 * DAY_MS);
    await createChannel(db, organizationId);
    await db.insert(schema.billingPayment).values({
      organizationId,
      customerId: "cust_1",
      checkoutId: `chk_running-${organizationId}`,
      cadence: "monthly",
      amount: "5.00",
      currency: "USD",
      status: "paid",
      periodEndsAt: new Date(Date.now() + DAY_MS),
      createdAt: new Date(),
    });

    const sent = await checkBillingReminders(db, new Date());
    expect(sent).toBe(0);
  }, 60_000);

  it("sends a reminder for a lapsed extra organization", async () => {
    const userId = await newOwner();
    await ownedOrganization(db, userId, Date.now() - 40 * DAY_MS);
    const extra = await ownedOrganization(db, userId, Date.now() - 10 * DAY_MS);
    await createChannel(db, extra);

    const sent = await checkBillingReminders(db, new Date());
    expect(sent).toBe(1);
  }, 30_000);

  it("does not remind the extra organization again within the cooldown", async () => {
    const userId = await newOwner();
    await ownedOrganization(db, userId, Date.now() - 40 * DAY_MS);
    const extra = await ownedOrganization(db, userId, Date.now() - 10 * DAY_MS);
    await createChannel(db, extra);

    await checkBillingReminders(db, new Date());
    const afterFirst = await db
      .select()
      .from(schema.organization)
      .where(eq(schema.organization.id, extra));
    expect(afterFirst[0]?.lastBillingReminderAt).not.toBeNull();

    const sent = await checkBillingReminders(db, new Date());
    expect(sent).toBe(0);
  }, 60_000);
});
