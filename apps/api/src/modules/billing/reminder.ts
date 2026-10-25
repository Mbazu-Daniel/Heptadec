import { eq } from "drizzle-orm";
import {
  organization,
  billingPayment,
  notificationChannel,
  type HeptadecDatabase,
} from "@heptadec/db";
import { config as configApp } from "../../common/config/env";
import { sendToChannel, type ISendResult } from "../notification/send";
import { entitlementFor } from "./entitlement";

const REMINDER_COOLDOWN_HOURS = 24;

export interface IReminderDelivery {
  channel: ISendResult["channel"];
  status: ISendResult["status"];
  error: string | null;
}

/**
 * Checks every organization for billing reminders.
 *
 * An organization is reminded when billing is configured, its trial has ended,
 * it has no successful payment, and the last reminder was more than a day ago.
 * Each reminder goes to every notification channel the organization owns.
 *
 * Returns how many reminders were sent, so a caller can report what happened.
 */
export async function checkBillingReminders(
  db: HeptadecDatabase,
  now: Date,
): Promise<number> {
  if (configApp.bachs.secretKey === "") {
    return 0;
  }

  const orgs = await db.select().from(organization);
  let sent = 0;

  for (const org of orgs) {
    const entitled = await entitlementFor(db, org.id);
    if (entitled.entitled) {
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

    const deliveries = await sendReminders(org.id, channels);
    for (const d of deliveries) {
      if (d.status === "sent") {
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

async function sendReminders(
  organizationId: string,
  channels: typeof notificationChannel.$inferSelect[],
): Promise<IReminderDelivery[]> {
  const subject = "Your Heptadec trial has ended";
  const message = `Your Heptadec organization's trial has ended. Start a charge to keep access: ${configApp.webUrl}`;
  const deliveries: IReminderDelivery[] = [];
  for (const channel of channels) {
    const result = await sendToChannel(channel, subject, message);
    deliveries.push({
      channel: result.channel,
      status: result.status,
      error: result.error,
    });
  }
  return deliveries;
}
