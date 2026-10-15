import type { AlertRuleRow, NotificationChannelRow } from "@heptadec/db";
import { schema, type HeptadecDatabase } from "@heptadec/db";
import { eq } from "drizzle-orm";
import { decryptSecret } from "../data-source/secret";
import type {
  INotificationConfig,
  NotificationKind,
} from "../notification/contracts";
import type { AlertDeliveryChannel, AlertDeliveryStatus } from "./contracts";

const { alertDelivery, notificationChannel } = schema;

const DELIVERY_TIMEOUT_MS = 10_000;

const RESEND_URL = "https://api.resend.com/emails";

export async function deliverBreach(
  db: HeptadecDatabase,
  rule: AlertRuleRow,
  message: string,
): Promise<void> {
  const channels = await db
    .select()
    .from(notificationChannel)
    .where(eq(notificationChannel.organizationId, rule.organizationId));

  if (channels.length === 0) {
    await log(
      db,
      rule,
      "none",
      "skipped",
      message,
      "No notification channel is connected",
    );
    return;
  }

  for (const channel of channels) {
    const kind = channel.kind as NotificationKind;
    const failure = await sendToChannel(
      channel,
      `Heptadec alert: ${rule.name}`,
      message,
    );
    await log(db, rule, kind, failure === null ? "sent" : "failed", message, failure);
  }
}

async function sendToChannel(
  channel: NotificationChannelRow,
  subject: string,
  message: string,
): Promise<string | null> {
  try {
    const config = JSON.parse(await decryptSecret(channel.config)) as INotificationConfig;
    return await post(config, JSON.parse(channel.recipients) as string[], subject, message);
  } catch {
    return "The channel could not be reached";
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
): Promise<void> {
  await db.insert(alertDelivery).values({
    organizationId: rule.organizationId,
    alertRuleId: rule.id,
    channel,
    status,
    message,
    error,
    createdAt: new Date(),
  });
}