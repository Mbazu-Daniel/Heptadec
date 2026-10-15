import { randomUUID } from "node:crypto";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const shareLink = sqliteTable("share_link", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id").notNull(),
  dashboardId: text("dashboard_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  snapshot: text("snapshot").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type ShareLinkRow = typeof shareLink.$inferSelect;

export type NewShareLinkRow = typeof shareLink.$inferInsert;
