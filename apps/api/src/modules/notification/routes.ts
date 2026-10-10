import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@heptadec/db";
import type { NotificationChannelRow } from "@heptadec/db";
import {
  requireSession,
  type IAuthVars,
} from "../../common/middleware/require-session";
import { readBody, readOptionalString, readString } from "../../common/http/body";
import {
  activeOrganization,
  oneRow,
} from "../../common/session/current-organization";
import { BadRequestException, NotFoundException } from "../../common/exceptions";
import { requireOwner } from "../rbac/owner";
import { recordAudit, auditActor } from "../audit";
import { encryptSecret, decryptSecret } from "../data-source/secret";
import {
  isNotificationKind,
  type IChannelView,
  type INotificationChannel,
  type INotificationChannelListResponse,
  type INotificationChannelResponse,
  type INotificationConfig,
  type NotificationKind,
} from "./contracts";

const { notificationChannel } = schema;

const MAX_NAME = 80;
const MAX_VALUE = 2_048;
const MAX_ADDRESS = 254;
const MAX_RECIPIENTS = 25;
const MAX_CHANNEL = 120;
const DEFAULT_SMTP_PORT = 587;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const URL_PATTERN = /^https?:\/\/\S+$/i;

export function notificationRoutes(): Hono<IAuthVars> {
  const routes = new Hono<IAuthVars>();

  routes.get("/api/notification-channels", requireSession, async (c) => {
    const organization = activeOrganization(c);

    const rows = await db
      .select()
      .from(notificationChannel)
      .where(organization.where(notificationChannel.organizationId))
      .orderBy(notificationChannel.createdAt);

    const body: INotificationChannelListResponse = {
      notificationChannels: rows.map(toChannel),
    };
    return c.json(body);
  });

  routes.post("/api/notification-channels", requireSession, async (c) => {
    await requireOwner(
      c.req.raw.headers,
      "Only owners can manage notification channels",
    );
    const organization = activeOrganization(c);

    const body = readBody(
      await c.req.json(),
      "A notification channel is required",
    );
    const name = readString(body, "name", "Name this channel", MAX_NAME);
    const kind = readKind(body);

    const now = new Date();
    const inserted = await db
      .insert(notificationChannel)
      .values({
        organizationId: organization.organizationId,
        name,
        kind,
        recipients: JSON.stringify(readRecipients(kind, body, [])),
        config: encryptSecret(JSON.stringify(readConfig(kind, body, null))),
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const created = inserted[0];
    if (created === undefined) {
      throw new NotFoundException("That channel could not be created");
    }
    const actor = auditActor(c);
    await recordAudit({
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "notification_channel.saved",
      targetKind: "notification_channel",
      targetId: created.id,
      targetLabel: created.name,
    });
    const response: INotificationChannelResponse = {
      notificationChannel: toChannel(created),
    };
    return c.json(response, 201);
  });

  routes.patch("/api/notification-channels/:id", requireSession, async (c) => {
    await requireOwner(
      c.req.raw.headers,
      "Only owners can manage notification channels",
    );
    const organization = activeOrganization(c);

    const existing = await oneRow(
      notificationChannel,
      c.req.param("id"),
      organization,
    );
    if (existing === undefined) {
      throw new NotFoundException("That channel does not exist");
    }

    const kind = existing.kind as NotificationKind;
    const body = readBody(
      await c.req.json(),
      "A notification channel is required",
    );
    const name = readString(body, "name", "Name this channel", MAX_NAME);
    const kept = storedConfig(existing);

    const updated = await db
      .update(notificationChannel)
      .set({
        name,
        recipients: JSON.stringify(
          readRecipients(kind, body, JSON.parse(existing.recipients) as string[]),
        ),
        config: encryptSecret(JSON.stringify(readConfig(kind, body, kept))),
        updatedAt: new Date(),
      })
      .where(eq(notificationChannel.id, existing.id))
      .returning();

    const row = updated[0];
    if (row === undefined) {
      throw new NotFoundException("That channel could not be saved");
    }
    const actor = auditActor(c);
    await recordAudit({
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "notification_channel.saved",
      targetKind: "notification_channel",
      targetId: row.id,
      targetLabel: row.name,
    });
    const response: INotificationChannelResponse = {
      notificationChannel: toChannel(row),
    };
    return c.json(response);
  });

  routes.delete("/api/notification-channels/:id", requireSession, async (c) => {
    await requireOwner(
      c.req.raw.headers,
      "Only owners can manage notification channels",
    );
    const organization = activeOrganization(c);

    const removed = await db
      .delete(notificationChannel)
      .where(
        and(
          eq(notificationChannel.id, c.req.param("id")),
          organization.where(notificationChannel.organizationId),
        ),
      )
      .returning();

    if (removed.length === 0) {
      throw new NotFoundException("That channel does not exist");
    }
    const actor = auditActor(c);
    await recordAudit({
      organizationId: organization.organizationId,
      actorId: actor.id,
      actorLabel: actor.label,
      event: "notification_channel.deleted",
      targetKind: "notification_channel",
      targetId: removed[0]!.id,
      targetLabel: removed[0]!.name,
    });
    return c.json({ deleted: true });
  });

  return routes;
}

function readKind(body: Record<string, unknown>): NotificationKind {
  const kind = readString(body, "kind", "Choose a channel type", 40);
  if (!isNotificationKind(kind)) {
    throw new BadRequestException(`${kind} is not a supported channel`);
  }
  return kind;
}

function storedConfig(row: NotificationChannelRow): INotificationConfig {
  return JSON.parse(decryptSecret(row.config)) as INotificationConfig;
}

function readConfig(
  kind: NotificationKind,
  body: Record<string, unknown>,
  kept: INotificationConfig | null,
): INotificationConfig {
  switch (kind) {
    case "slack": {
      const was = kept?.kind === "slack" ? kept : null;
      return {
        kind,
        webhookUrl: readUrl(
          body,
          "webhookUrl",
          "Paste the Slack webhook URL",
          was?.webhookUrl,
        ),
        channel: readNullable(body, "channel", was?.channel ?? null, MAX_CHANNEL),
      };
    }
    case "email": {
      const was = kept?.kind === "email" ? kept : null;
      return {
        kind,
        smtpHost: readRequired(
          body,
          "smtpHost",
          "Give the SMTP server",
          was?.smtpHost,
        ),
        smtpPort: readPort(body, was?.smtpPort),
        username: readNullable(body, "username", was?.username ?? null, MAX_ADDRESS) ?? "",
        password: readSecret(body, "password", was?.password ?? ""),
        fromAddress: readAddress(
          body,
          "fromAddress",
          "Give the address the message is sent from",
          was?.fromAddress,
        ),
      };
    }
    case "resend": {
      const was = kept?.kind === "resend" ? kept : null;
      return {
        kind,
        apiKey: readRequired(
          body,
          "apiKey",
          "Paste the Resend API key",
          was?.apiKey,
        ),
        fromAddress: readAddress(
          body,
          "fromAddress",
          "Give the address the message is sent from",
          was?.fromAddress,
        ),
      };
    }
  }
}

function readRequired(
  body: Record<string, unknown>,
  field: string,
  message: string,
  kept: string | undefined,
): string {
  if (body[field] === "") {
    return kept ?? missing(message);
  }
  return readOptionalString(body, field, message, MAX_VALUE) ?? kept ?? missing(message);
}

function readSecret(
  body: Record<string, unknown>,
  field: string,
  kept: string,
): string {
  if (body[field] === "") {
    return kept;
  }
  return readOptionalString(body, field, "That value is not valid", MAX_VALUE) ?? kept;
}

function readNullable(
  body: Record<string, unknown>,
  field: string,
  kept: string | null,
  max: number,
): string | null {
  if (body[field] === "") {
    return null;
  }
  return readOptionalString(body, field, "That value is not valid", max) ?? kept;
}

function readUrl(
  body: Record<string, unknown>,
  field: string,
  message: string,
  kept: string | undefined,
): string {
  const value = readRequired(body, field, message, kept);
  if (!URL_PATTERN.test(value)) {
    throw new BadRequestException(message);
  }
  return value;
}

function readAddress(
  body: Record<string, unknown>,
  field: string,
  message: string,
  kept: string | undefined,
): string {
  const value = readRequired(body, field, message, kept);
  if (!EMAIL_PATTERN.test(value)) {
    throw new BadRequestException(message);
  }
  return value;
}

function readPort(body: Record<string, unknown>, kept: number | undefined): number {
  const raw = body.smtpPort;
  if (raw === undefined || raw === null || raw === "") {
    return kept ?? DEFAULT_SMTP_PORT;
  }
  const port = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new BadRequestException("The SMTP port must be between 1 and 65535");
  }
  return port;
}

function readRecipients(
  kind: NotificationKind,
  body: Record<string, unknown>,
  kept: string[],
): string[] {
  const wantsRecipients = kind !== "slack";
  if (!wantsRecipients) {
    if (body.recipients !== undefined && body.recipients !== null) {
      throw new BadRequestException(
        "Only an email channel carries a list of addresses",
      );
    }
    return [];
  }

  const raw = body.recipients;
  if (raw === undefined || raw === null) {
    if (kept.length === 0) {
      throw new BadRequestException("Give at least one address to send to");
    }
    return kept;
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new BadRequestException("Give at least one address to send to");
  }
  if (raw.length > MAX_RECIPIENTS) {
    throw new BadRequestException(
      `Keep the list to ${MAX_RECIPIENTS} addresses`,
    );
  }
  return raw.map((entry) => {
    if (typeof entry !== "string" || !EMAIL_PATTERN.test(entry)) {
      throw new BadRequestException(
        "Every address must look like name@example.com",
      );
    }
    return entry;
  });
}

function missing(message: string): never {
  throw new BadRequestException(message);
}

function toChannel(row: NotificationChannelRow): INotificationChannel {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind as NotificationKind,
    recipients: JSON.parse(row.recipients) as string[],
    config: viewOf(storedConfig(row)),
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