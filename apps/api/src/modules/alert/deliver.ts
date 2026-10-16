import type { AlertRuleRow, NotificationChannelRow } from "@heptadec/db";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import { eq } from "drizzle-orm";
import { decryptSecret } from "../data-source/secret";
import { driverFailure } from "../../common/driver-error";
import type {
  INotificationConfig,
  NotificationKind,
} from "../notification/contracts";
import type {
  AlertDeliveryChannel,
  AlertDeliveryStatus,
  IAlertDelivery,
} from "./contracts";

const { alertDelivery, notificationChannel } = schema;

const DELIVERY_TIMEOUT_MS = 10_000;

const RESEND_URL = "https://api.resend.com/emails";

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

  const delivered: IAlertDelivery[] = [];
  for (const channel of channels) {
    const kind = channel.kind as NotificationKind;
    const failure = await sendToChannel(
      channel,
      `Heptadec alert: ${rule.name}`,
      message,
    );
    delivered.push(
      await log(db, rule, kind, failure === null ? "sent" : "failed", message, failure),
    );
  }
  return delivered;
}

async function sendToChannel(
  channel: NotificationChannelRow,
  subject: string,
  message: string,
): Promise<string | null> {
  let config: INotificationConfig;
  let recipients: string[];
  try {
    config = JSON.parse(await decryptSecret(channel.config)) as INotificationConfig;
    recipients = JSON.parse(channel.recipients) as string[];
  } catch (caught) {
    // A configuration that will not open is a failure of what was stored, not
    // of the network, so it says so rather than reading as a channel that could
    // not be reached, and the driver's own words reach the operator.
    return (
      driverFailure(caught, "open that channel's sealed configuration") ??
      "That channel's configuration could not be read"
    );
  }
  try {
    return await post(config, recipients, subject, message);
  } catch (caught) {
    return (
      driverFailure(caught, "reach that channel") ??
      "The channel could not be reached"
    );
  }
}

async function post(
  config: INotificationConfig,
  recipients: string[],
  subject: string,
  message: string,
): Promise<string | null> {
  switch (config.kind) {
    case "slack":
      return await postJson(
        config.webhookUrl,
        config.channel === null
          ? { text: message }
          : { channel: config.channel, text: message },
      );
    case "email": {
      if (recipients.length === 0) {
        return "No recipient is set on this channel";
      }
      // nodemailer speaks SMTP over a socket, which Workers cannot open. It is
      // loaded only here so the runtime never evaluates it at startup.
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpPort === 465,
        auth:
          config.username === ""
            ? undefined
            : { user: config.username, pass: config.password },
      });
      try {
        await transporter.sendMail({
          from: config.fromAddress,
          to: recipients.join(", "),
          replyTo: config.fromAddress,
          subject,
          text: message,
        });
        return null;
      } finally {
        transporter.close();
      }
    }
    case "resend": {
      if (recipients.length === 0) {
        return "No recipient is set on this channel";
      }
      return await postJson(
        RESEND_URL,
        { from: config.fromAddress, to: recipients, subject, text: message },
        config.apiKey,
      );
    }
  }
}

async function postJson(
  url: string,
  payload: unknown,
  bearer?: string,
): Promise<string | null> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });
  return response.ok ? null : "The channel answered with an error";
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