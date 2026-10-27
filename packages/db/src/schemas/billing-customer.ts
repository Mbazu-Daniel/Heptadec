import { randomUUID } from "node:crypto";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const billingCustomer = sqliteTable(
  "billing_customer",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id").notNull().unique(),
    customerId: text("customer_id").notNull().unique(),
    paymentMethodId: text("payment_method_id"),
    cardBrand: text("card_brand"),
    cardLast4: text("card_last4"),
    autoRenew: integer("auto_renew", { mode: "boolean" }).notNull(),
    pendingChargeId: text("pending_charge_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("billing_customer_pending_charge_idx").on(table.pendingChargeId)],
);

export type BillingCustomerRow = typeof billingCustomer.$inferSelect;
export type NewBillingCustomerRow = typeof billingCustomer.$inferInsert;
