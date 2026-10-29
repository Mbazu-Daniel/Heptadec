import {
  alertDelivery,
  notificationChannel,
  type AlertRuleRow,
  type HeptadecDatabase,
} from "@heptadec/db";
import { eq } from "drizzle-orm";
import { sendToChannel } from "../notification/send";
import type {
  AlertDeliveryChannel,
  AlertDeliveryStatus,
  IAlertDelivery,
} from "./contracts";

/** The row as the app hands it over. One owner, so the check that wrote a
 * delivery and the route that reports it cannot describe it differently. */
export function toAlertDelivery(
  row: typeof alertDelivery.$inferSelect,
): IAlertDelivery {
  return {
    id: row.id,
    alertRuleId: row.alertRuleId,
    channel: row.channel as AlertDeliveryChannel,
    status: row.status as AlertDeliveryStatus,
    message: row.message,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * One breach goes to every connected channel; one channel failing never
 * stops the others, and any outcome — sent, failed, skipped — is logged as
 * its own delivery.
 */
export async function deliverBreach(
  db: HeptadecDatabase,
  rule: AlertRuleRow,
  message: string,
): Promise<IAlertDelivery[]> {
  const channels = await db
    .select()
    .from(notificationChannel)
    .where(eq(notificationChannel.organizationId, rule.organizationId));

  if (channels.length === 0) {
    return [
      await log(
        db,
        rule,
        "none",
        "skipped",
        message,
        "No notification channel is connected",
      ),
    ];
  }

  const sent = await Promise.all(
    channels.map((channel) =>
      sendToChannel(channel, `Heptadec alert: ${rule.name}`, message),
    ),
  );

  const delivered: IAlertDelivery[] = [];
  for (const result of sent) {
    delivered.push(
      await log(db, rule, result.channel, result.status, message, result.error),
    );
  }
  return delivered;
}

async function log(
  db: HeptadecDatabase,
  rule: AlertRuleRow,
  channel: AlertDeliveryChannel,
  status: AlertDeliveryStatus,
  message: string,
  error: string | null,
): Promise<IAlertDelivery> {
  const inserted = await db
    .insert(alertDelivery)
    .values({
      organizationId: rule.organizationId,
      alertRuleId: rule.id,
      channel,
      status,
      message,
      error,
      createdAt: new Date(),
    })
    .returning();
  return toAlertDelivery(inserted[0]!);
}
