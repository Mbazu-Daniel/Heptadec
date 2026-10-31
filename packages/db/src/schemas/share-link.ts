import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { organization } from "./organization/organization";

export const shareLink = sqliteTable(
  "share_link",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    dashboardId: text("dashboard_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    snapshot: text("snapshot").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("share_link_token_hash_idx").on(table.tokenHash),
    index("share_link_dashboard_created_idx").on(
      table.dashboardId,
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export type ShareLinkRow = typeof shareLink.$inferSelect;

export type NewShareLinkRow = typeof shareLink.$inferInsert;
