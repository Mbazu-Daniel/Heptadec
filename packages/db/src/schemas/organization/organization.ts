import { randomUUID } from "node:crypto";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const organization = sqliteTable("organization", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  lastBillingReminderAt: integer("last_billing_reminder_at", { mode: "timestamp_ms" }),
});

export type OrganizationRow = typeof organization.$inferSelect;

export type NewOrganizationRow = typeof organization.$inferInsert;