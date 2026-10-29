import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const aiProvider = sqliteTable(
  "ai_provider",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id").notNull(),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    baseUrl: text("base_url"),
    apiKey: text("api_key").notNull(),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("ai_provider_organization_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    index("ai_provider_organization_provider_idx").on(
      table.organizationId,
      table.provider,
    ),
  ],
);

export type AiProviderRow = typeof aiProvider.$inferSelect;

export type NewAiProviderRow = typeof aiProvider.$inferInsert;
