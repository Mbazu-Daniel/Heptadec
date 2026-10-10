export const NOTIFICATION_KINDS = ["slack", "email", "resend"] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export function isNotificationKind(value: string): value is NotificationKind {
  return (NOTIFICATION_KINDS as readonly string[]).includes(value);
}

export const NOTIFICATION_LABELS: Record<NotificationKind, string> = {
  slack: "Slack",
  email: "Email",
  resend: "Resend",
};

export interface ISlackConfig {
  kind: "slack";
  webhookUrl: string;
  channel: string | null;
}

export interface IEmailConfig {
  kind: "email";
  smtpHost: string;
  smtpPort: number;
  username: string;
  password: string;
  fromAddress: string;
}

export interface IResendConfig {
  kind: "resend";
  apiKey: string;
  fromAddress: string;
}

export type INotificationConfig =
  | ISlackConfig
  | IEmailConfig
  | IResendConfig;

export type IChannelView = {
  slack: Omit<ISlackConfig, "webhookUrl">;
  email: Omit<IEmailConfig, "password">;
  resend: Omit<IResendConfig, "apiKey">;
}[NotificationKind];

export interface INotificationChannel {
  id: string;
  name: string;
  kind: NotificationKind;
  recipients: string[];
  config: IChannelView;
  createdAt: string;
  updatedAt: string;
}

export interface INotificationChannelListResponse {
  notificationChannels: INotificationChannel[];
}

export interface INotificationChannelResponse {
  notificationChannel: INotificationChannel;
}

export interface ISaveNotificationChannelRequest {
  name: string;
  kind: NotificationKind;
  recipients?: string[];
  webhookUrl?: string;
  channel?: string;
  apiKey?: string;
  smtpHost?: string;
  smtpPort?: number;
  username?: string;
  password?: string;
  fromAddress?: string;
}

export type ICreateNotificationChannelRequest =
  ISaveNotificationChannelRequest;

export type IUpdateNotificationChannelRequest =
  ISaveNotificationChannelRequest;

export type NotificationFieldKind =
  | "webhookUrl"
  | "channel"
  | "apiKey"
  | "smtpHost"
  | "smtpPort"
  | "username"
  | "password"
  | "fromAddress";

export interface INotificationField {
  kind: NotificationFieldKind;
  label: string;
  placeholder: string;
  secret: boolean;
  optional: boolean;
  wide: boolean;
}

export interface IChannelSpec {
  label: string;
  fields: INotificationField[];
  recipients: boolean;
}

function field(
  kind: NotificationFieldKind,
  label: string,
  placeholder: string,
  options: { secret?: boolean; optional?: boolean; wide?: boolean } = {},
): INotificationField {
  return {
    kind,
    label,
    placeholder,
    secret: options.secret ?? false,
    optional: options.optional ?? false,
    wide: options.wide ?? false,
  };
}

export const CHANNEL_SPECS: Record<NotificationKind, IChannelSpec> = {
  slack: {
    label: "Slack",
    fields: [
      field("webhookUrl", "Webhook URL", "https://hooks.slack.com/services/T…/B…/…", {
        secret: true,
        wide: true,
      }),
      field("channel", "Channel", "#alerts", { optional: true, wide: true }),
    ],
    recipients: false,
  },
  email: {
    label: "Email",
    fields: [
      field("smtpHost", "SMTP Server", "smtp.gmail.com"),
      field("smtpPort", "SMTP Port", "587"),
      field("username", "Username", "username", { optional: true }),
      field("password", "Password", "", { secret: true, optional: true }),
      field("fromAddress", "From Address", "from@example.com", { wide: true }),
    ],
    recipients: true,
  },
  resend: {
    label: "Resend",
    fields: [
      field("apiKey", "API key", "re_…", { secret: true, wide: true }),
      field("fromAddress", "From Address", "alerts@example.com", { wide: true }),
    ],
    recipients: true,
  },
};