import { randomUUID } from "node:crypto";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "../auth/user";
import { organization } from "./organization";

export const member = sqliteTable(
  "member",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    displayName: text("display_name"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("member_organization_user_unique").on(
      table.organizationId,
      table.userId,
    ),
  ],
);

export type MemberRow = typeof member.$inferSelect;

export type NewMemberRow = typeof member.$inferInsert;