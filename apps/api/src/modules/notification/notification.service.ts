import { and, eq } from "drizzle-orm";
import {
  notificationChannel,
  type NotificationChannelRow,
} from "@heptadec/db";
import type { IOrganizationScope } from "../../common/session/current-organization";
import { oneRow } from "../../common/session/current-organization";
import { NotFoundException } from "../../common/exceptions/index";
import { encryptSecret, decryptSecret } from "../data-source/secret";
import type {
  IChannelView,
  INotificationChannel,
  INotificationChannelListResponse,
  INotificationChannelResponse,
  INotificationConfig,
  NotificationKind,
} from "./contracts";
import type {
  IChannelForUpdate,
  ICreateNotificationChannelInput,
  IUpdateNotificationChannelInput,
} from "./types";

export async function listNotificationChannels(
  organization: IOrganizationScope,
): Promise<INotificationChannelListResponse> {
  const rows = await organization.db
    .select()
    .from(notificationChannel)
    .where(organization.where(notificationChannel.organizationId))
    .orderBy(notificationChannel.createdAt);

  return {
    notificationChannels: await Promise.all(rows.map(toChannel)),
  };
}

export async function createNotificationChannel(
  organization: IOrganizationScope,
  input: ICreateNotificationChannelInput,
): Promise<INotificationChannelResponse> {
  const now = new Date();
  const inserted = await organization.db
    .insert(notificationChannel)
    .values({
      organizationId: organization.organizationId,
      name: input.name,
      kind: input.kind,
      recipients: JSON.stringify(input.recipients),
      config: await encryptSecret(JSON.stringify(input.config)),
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const created = inserted[0];
  if (created === undefined) {
    throw new NotFoundException("That channel could not be created");
  }
  return { notificationChannel: await toChannel(created) };
}

export async function getChannelForUpdate(
  organization: IOrganizationScope,
  id: string,
): Promise<IChannelForUpdate> {
  const row = await oneRow(organization.db, notificationChannel, id, organization);
  if (row === undefined) {
    throw new NotFoundException("That channel does not exist");
  }
  return {
    row,
    kind: row.kind as NotificationKind,
    kept: await storedConfig(row),
  };
}

export async function updateNotificationChannel(
  organization: IOrganizationScope,
  id: string,
  input: IUpdateNotificationChannelInput,
): Promise<INotificationChannelResponse> {
  const updated = await organization.db
    .update(notificationChannel)
    .set({
      name: input.name,
      recipients: JSON.stringify(input.recipients),
      config: await encryptSecret(JSON.stringify(input.config)),
      updatedAt: new Date(),
    })
    .where(eq(notificationChannel.id, id))
    .returning();

  const row = updated[0];
  if (row === undefined) {
    throw new NotFoundException("That channel could not be saved");
  }
  return { notificationChannel: await toChannel(row) };
}

export async function deleteNotificationChannel(
  organization: IOrganizationScope,
  id: string,
): Promise<{ id: string; name: string }> {
  const removed = await organization.db
    .delete(notificationChannel)
    .where(
      and(
        eq(notificationChannel.id, id),
        organization.where(notificationChannel.organizationId),
      ),
    )
    .returning();

  if (removed.length === 0) {
    throw new NotFoundException("That channel does not exist");
  }
  return { id: removed[0]!.id, name: removed[0]!.name };
}

export async function storedConfig(
  row: NotificationChannelRow,
): Promise<INotificationConfig> {
  return JSON.parse(await decryptSecret(row.config)) as INotificationConfig;
}

async function toChannel(
  row: NotificationChannelRow,
): Promise<INotificationChannel> {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as NotificationKind,
    recipients: JSON.parse(row.recipients) as string[],
    config: viewOf(await storedConfig(row)),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function viewOf(config: INotificationConfig): IChannelView {
  if (config.kind === "email") {
    const { password: _password, ...view } = config;
    return view;
  }
  if (config.kind === "resend") {
    const { apiKey: _apiKey, ...view } = config;
    return view;
  }
  const { webhookUrl: _webhookUrl, ...view } = config;
  return view;
}
