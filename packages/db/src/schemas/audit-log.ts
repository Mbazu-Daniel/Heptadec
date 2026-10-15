import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id").notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    actorId: text("actor_id").notNull(),
    actorLabel: text("actor_label").notNull(),
    event: text("event").notNull(),
    targetKind: text("target_kind").notNull(),
    targetId: text("target_id"),
    targetLabel: text("target_label"),
    detail: text("detail"),
  },
  (table) => [
    index("audit_log_organization_occurred_idx").on(
      table.organizationId,
      table.occurredAt,
    ),
  ],
);

export type AuditLogRow = typeof auditLog.$inferSelect;

export type NewAuditLogRow = typeof auditLog.$inferInsert;
