import { eq, isNotNull } from "drizzle-orm";
import {
  organization,
  billingCustomer,
  notificationChannel,
  type HeptadecDatabase,
} from "@heptadec/db";
import { config as configApp } from "../../common/config/env";
import { sendToChannel } from "../notification/send";
import { entitlementFor } from "./entitlement";

const REMINDER_COOLDOWN_HOURS = 24;

export async function checkBillingReminders(
  db: HeptadecDatabase,
  now: Date,
): Promise<number> {
  if (configApp.bachs.secretKey === "") {
    return 0;
  }

  const subject = "Your Heptadec access has ended";
  const message = `Access to your Heptadec organization has ended. Buy a plan to open it again: ${configApp.webUrl}`;
  const orgs = await db.select().from(organization);
  const inFlight = await db
    .select({ organizationId: billingCustomer.organizationId })
    .from(billingCustomer)
    .where(isNotNull(billingCustomer.pendingChargeId));
  const renewing = new Set(inFlight.map((row) => row.organizationId));
  let sent = 0;

  for (const org of orgs) {
    const entitled = await entitlementFor(db, org.id);
    if (entitled.entitled) {
      continue;
    }

    if (renewing.has(org.id)) {
      continue;
    }

    const lastReminder = org.lastBillingReminderAt;
    if (lastReminder !== null) {
      const since = now.getTime() - new Date(lastReminder).getTime();
      if (since < REMINDER_COOLDOWN_HOURS * 60 * 60 * 1000) {
        continue;
      }
    }

    const channels = await db
      .select()
      .from(notificationChannel)
      .where(eq(notificationChannel.organizationId, org.id));

    if (channels.length === 0) {
      continue;
    }

    for (const channel of channels) {
      const result = await sendToChannel(channel, subject, message);
      if (result.status === "sent") {
        sent += 1;
      }
    }

    await db
      .update(organization)
      .set({ lastBillingReminderAt: now })
      .where(eq(organization.id, org.id));
  }

  return sent;
}
