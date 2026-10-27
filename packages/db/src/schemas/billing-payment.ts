import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const billingPayment = sqliteTable(
  "billing_payment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id").notNull(),
    customerId: text("customer_id"),
    checkoutId: text("checkout_id").unique(),
    chargeId: text("charge_id").unique(),
    cadence: text("cadence", { enum: ["monthly", "yearly"] }),
    amount: text("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    periodEndsAt: integer("period_ends_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("billing_payment_organization_period_idx").on(
      table.organizationId,
      table.periodEndsAt,
    ),
  ],
);

export type BillingPaymentRow = typeof billingPayment.$inferSelect;
export type NewBillingPaymentRow = typeof billingPayment.$inferInsert;
