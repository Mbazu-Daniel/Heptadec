import { randomUUID } from "node:crypto";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const notificationChannel = sqliteTable("notification_channel", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull(),
  recipients: text("recipients").notNull(),
  config: text("config").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type NotificationChannelRow = typeof notificationChannel.$inferSelect;

export type NewNotificationChannelRow = typeof notificationChannel.$inferInsert;
