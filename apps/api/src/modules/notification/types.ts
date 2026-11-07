import type { NotificationChannelRow } from "@heptadec/db";
import type {
  INotificationConfig,
  NotificationKind,
} from "./contracts";

export interface ICreateNotificationChannelInput {
  name: string;
  kind: NotificationKind;
  recipients: string[];
  config: INotificationConfig;
}

export interface IUpdateNotificationChannelInput {
  name: string;
  recipients: string[];
  config: INotificationConfig;
}

export interface IChannelForUpdate {
  row: NotificationChannelRow;
  kind: NotificationKind;
  kept: INotificationConfig;
}
