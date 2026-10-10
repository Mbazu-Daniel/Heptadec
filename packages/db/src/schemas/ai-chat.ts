import { randomUUID } from "node:crypto";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const aiChat = sqliteTable("ai_chat", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id").notNull(),
  dataSourceId: text("data_source_id").notNull(),
  providerName: text("provider_name").notNull(),
  model: text("model").notNull(),
  question: text("question").notNull(),
  sql: text("sql"),
  problem: text("problem"),
  durationMs: integer("duration_ms").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type AiChatRow = typeof aiChat.$inferSelect;

export type NewAiChatRow = typeof aiChat.$inferInsert;
