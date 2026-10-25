CREATE TABLE `billing_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`customer_id` text,
	`checkout_id` text NOT NULL,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`period_ends_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_payment_checkout_id_unique` ON `billing_payment` (`checkout_id`);--> statement-breakpoint
ALTER TABLE `organization` ADD `last_billing_reminder_at` integer;