import { randomUUID } from "node:crypto";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * One organization's subscription, as Bachs last reported it. The unique index
 * on `organizationId` is the database's statement that an organization keeps
 * one subscription: a cancel and a fresh sign-up update this row rather than
 * starting a second one.
 *
 * Every column here is copied from a Bachs subscription webhook, including
 * `eventCreatedAt`. Deliveries are at-least-once and out of order, so the event
 * time is what decides whether a delivery is news or a repeat.
 */
export const billingSubscription = sqliteTable("billing_subscription", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  organizationId: text("organization_id").notNull().unique(),
  customerId: text("customer_id").notNull(),
  subscriptionId: text("subscription_id").notNull(),
  productId: text("product_id").notNull(),
  status: text("status").notNull(),
  currentPeriodEnd: integer("current_period_end", { mode: "timestamp_ms" }),
  cancelAtPeriodEnd: integer("cancel_at_period_end", { mode: "boolean" }).notNull(),
  eventCreatedAt: integer("event_created_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type BillingSubscriptionRow = typeof billingSubscription.$inferSelect;

export type NewBillingSubscriptionRow = typeof billingSubscription.$inferInsert;
