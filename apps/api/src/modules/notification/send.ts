import {
  type NotificationChannelRow,
} from "@heptadec/db";
import { driverFailure } from "../../common/driver-error";
import { decryptSecret } from "../data-source/secret";
import type { INotificationConfig, NotificationKind } from "./contracts";

const DELIVERY_TIMEOUT_MS = 10_000;

export const RESEND_URL = "https://api.resend.com/emails";

export interface ISendResult {
  channel: NotificationKind;
  status: "sent" | "failed";
  error: string | null;
}

export async function sendToChannel(
  channel: NotificationChannelRow,
  subject: string,
  message: string,
): Promise<ISendResult> {
  let config: INotificationConfig;
  let recipients: string[];
  try {
    config = JSON.parse(await decryptSecret(channel.config)) as INotificationConfig;
    recipients = JSON.parse(channel.recipients) as string[];
  } catch (caught) {
    return {
      channel: channel.kind as NotificationKind,
      status: "failed",
      error:
        driverFailure(caught, "open that channel's sealed configuration") ??
        "That channel's configuration could not be read",
    };
  }
  try {
    const failure = await post(config, recipients, subject, message);
    return {
      channel: config.kind,
      status: failure === null ? "sent" : "failed",
      error: failure,
    };
  } catch (caught) {
    return {
      channel: config.kind,
      status: "failed",
      error:
        driverFailure(caught, "reach that channel") ??
        "The channel could not be reached",
    };
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
