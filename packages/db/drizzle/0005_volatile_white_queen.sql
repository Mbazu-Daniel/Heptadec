CREATE TABLE `billing_customer` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`payment_method_id` text,
	`card_brand` text,
	`card_last4` text,
	`auto_renew` integer NOT NULL,
	`pending_charge_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_customer_organization_id_unique` ON `billing_customer` (`organization_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_customer_customer_id_unique` ON `billing_customer` (`customer_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_billing_payment` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`customer_id` text,
	`checkout_id` text,
	`charge_id` text,
	`cadence` text,
	`amount` text NOT NULL,
	`currency` text NOT NULL,
	`status` text NOT NULL,
	`period_ends_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_billing_payment`("id", "organization_id", "customer_id", "checkout_id", "amount", "currency", "status", "period_ends_at", "created_at") SELECT "id", "organization_id", "customer_id", "checkout_id", "amount", "currency", "status", "period_ends_at", "created_at" FROM `billing_payment`;--> statement-breakpoint
DROP TABLE `billing_payment`;--> statement-breakpoint
ALTER TABLE `__new_billing_payment` RENAME TO `billing_payment`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `billing_payment_checkout_id_unique` ON `billing_payment` (`checkout_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_payment_charge_id_unique` ON `billing_payment` (`charge_id`);