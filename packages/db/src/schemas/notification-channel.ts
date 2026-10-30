import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization/organization";

export const notificationChannel = sqliteTable(
  "notification_channel",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    recipients: text("recipients").notNull(),
    config: text("config").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("notification_channel_organization_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export type NotificationChannelRow = typeof notificationChannel.$inferSelect;

export type NewNotificationChannelRow = typeof notificationChannel.$inferInsert;
