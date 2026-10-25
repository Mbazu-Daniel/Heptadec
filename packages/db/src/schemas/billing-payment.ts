import { randomUUID } from "node:crypto";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const billingPayment = sqliteTable("billing_payment", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id").notNull(),
  customerId: text("customer_id"),
  checkoutId: text("checkout_id").notNull().unique(),
  amount: text("amount").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull(),
  periodEndsAt: integer("period_ends_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type BillingPaymentRow = typeof billingPayment.$inferSelect;
export type NewBillingPaymentRow = typeof billingPayment.$inferInsert;
